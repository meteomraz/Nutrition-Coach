let foods = [];
let defaultFoods = [];
let mealTemplates = [];
let customFoods = JSON.parse(localStorage.getItem('nutritionCustomFoods') || '[]');
let favoriteFoodKeys = JSON.parse(localStorage.getItem('nutritionFavoriteFoods') || '[]');

const legacyReport = localStorage.getItem('nutritionReport');
let reports = JSON.parse(localStorage.getItem('nutritionReportsByDayType') || 'null') || {
  training: legacyReport ? JSON.parse(legacyReport) : [],
  rest: []
};
let currentDayType = localStorage.getItem('nutritionDayType') || 'training';
let clientName = localStorage.getItem('nutritionClientName') || '';
let clientDescription = localStorage.getItem('nutritionClientDescription') || '';
let targetPresets = JSON.parse(localStorage.getItem('nutritionTargetPresets') || JSON.stringify({
  training: { kcal: 3000, protein: 220, carbs: 350, fat: 70 },
  rest: { kcal: 2600, protein: 220, carbs: 220, fat: 85 }
}));

const $ = (id) => document.getElementById(id);
const round = (n) => Math.round(n * 10) / 10;
const mealOrder = ['Snídaně','Svačina','Oběd','Odpolední svačina','Večeře','Druhá večeře'];
const mealNameMap = { 'Před tréninkem': 'Odpolední svačina', 'Po tréninku': 'Večeře', 'Večeře': 'Druhá večeře' };
function normalizeMealName(meal){ return mealNameMap[meal] || meal; }
Object.keys(reports).forEach(type => { reports[type] = (reports[type] || []).map(item => ({...item, meal: normalizeMealName(item.meal)})); });

async function loadFoods(){
  const res = await fetch('foods.json');
  defaultFoods = await res.json();
  const savedFoods = localStorage.getItem('nutritionFoods');
  const baseFoods = savedFoods ? mergeDefaultFoods(JSON.parse(savedFoods), defaultFoods) : defaultFoods;
  foods = mergeDefaultFoods(customFoods, baseFoods);
  refreshFoodSelect();
  updateImportStatus('Databáze potravin načtena.');
  render();
}

function mergeDefaultFoods(saved, defaults){
  const byName = new Map((saved || []).map(f => [normalizeText(f.name), f]));
  (defaults || []).forEach(f => {
    const key = normalizeText(f.name);
    if(!byName.has(key)) byName.set(key, f);
  });
  return Array.from(byName.values());
}

function normalizeText(value){
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function foodKey(foodOrName){
  return normalizeText(typeof foodOrName === 'string' ? foodOrName : foodOrName?.name);
}

function isLiquidFood(foodOrName){
  const food = typeof foodOrName === 'string' ? findFoodSmart(foodOrName) : foodOrName;
  const text = normalizeText(`${food?.name || foodOrName || ''} ${food?.category || ''} ${food?.unitType || ''}`);
  if(food?.unitType === 'ml' || food?.liquid === true) return true;
  const liquidWords = ['voda','mleko','mléko','napoj','nápoj','dzus','džus','juice','smoothie','kefir','acidofilni','acidofilní','podmasli','podmáslí','syrovatka','olej','sirup','kokosove mleko','mandlove mleko','sojove mleko','ovesne mleko','ryzove mleko'];
  return liquidWords.some(word => text.includes(normalizeText(word)));
}

function amountUnitForFood(food){
  return isLiquidFood(food) ? 'ml' : 'g';
}

function formatAmount(foodOrName, grams){
  const unit = amountUnitForFood(foodOrName);
  return `${round(Number(grams) || 0)} ${unit}`;
}

function updateAmountLabelForItem(item){
  if(!item) return item;
  const food = findFoodSmart(item.name) || item;
  const grams = Number(item.grams || 0);
  if(item.unitMode === 'piece' && Number(item.pieceWeight || food.pieceWeight || 0) > 0){
    const pieceName = item.pieceName || food.pieceName || 'ks';
    const amount = Number(item.amount || (grams / Number(item.pieceWeight || food.pieceWeight || 1)) || 0);
    return { ...item, amountLabel: `${round(amount)} ${pieceName} / ${formatAmount(food, grams)}` };
  }
  return { ...item, amount: grams, unitMode: amountUnitForFood(food), amountLabel: formatAmount(food, grams) };
}


function isFavoriteFood(foodOrName){
  const key = foodKey(foodOrName);
  return key && favoriteFoodKeys.includes(key);
}

function saveFavorites(){
  localStorage.setItem('nutritionFavoriteFoods', JSON.stringify(favoriteFoodKeys));
}

function refreshFoodDatabase(){
  const savedFoods = localStorage.getItem('nutritionFoods');
  const baseFoods = savedFoods ? mergeDefaultFoods(JSON.parse(savedFoods), defaultFoods) : defaultFoods;
  foods = mergeDefaultFoods(customFoods, baseFoods);
  refreshFoodSelect();
  updateImportStatus('Databáze potravin aktualizována.');
}


async function loadTemplates(){
  let defaults = [];
  try{
    const res = await fetch('meal-templates.json');
    defaults = await res.json();
  }catch(error){
    defaults = [];
  }

  const savedTemplates = JSON.parse(localStorage.getItem('nutritionMealTemplates') || '[]');
  const byId = new Map(defaults.map(t => [t.id, t]));
  savedTemplates.forEach(t => byId.set(t.id, t));
  mealTemplates = Array.from(byId.values());
  refreshTemplateSelect();
}

function persistTemplates(){
  localStorage.setItem('nutritionMealTemplates', JSON.stringify(mealTemplates));
}

function makeTemplateId(name){
  const base = normalizeText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sablona';
  let id = base;
  let counter = 2;
  while(mealTemplates.some(t => t.id === id)){
    id = `${base}-${counter++}`;
  }
  return id;
}

function reportToTemplateItems(type = currentDayType){
  return getReport(type).map(x => ({
    meal: normalizeMealName(x.meal),
    name: x.name,
    grams: Number(x.grams) || 0,
    kcal: round(Number(x.kcal) || 0),
    protein: round(Number(x.protein) || 0),
    carbs: round(Number(x.carbs) || 0),
    fat: round(Number(x.fat) || 0)
  }));
}

function saveCurrentTemplate(){
  const template = getSelectedTemplate();
  if(!template) return alert('Nejdřív vyber šablonu, kterou chceš přepsat.');
  if(!getReport().length) return alert('Aktuální jídelníček je prázdný. Nejdřív načti nebo vytvoř jídelníček.');
  const updated = {
    ...template,
    targets: getTargets(),
    items: reportToTemplateItems(),
    description: `Upraveno v aplikaci ${new Date().toLocaleDateString('cs-CZ')}.`
  };
  mealTemplates = mealTemplates.map(t => t.id === template.id ? updated : t);
  persistTemplates();
  refreshTemplateSelect();
  $('templateSelect').value = updated.id;
  updateTemplatePreview();
  alert(`Šablona uložena: ${updated.name}`);
}

function createNewTemplate(){
  const name = ($('newTemplateName')?.value || '').trim();
  if(!name) return alert('Vyplň název nové šablony.');
  if(!getReport().length) return alert('Aktuální jídelníček je prázdný. Přidej položky, které se mají uložit do šablony.');
  const created = {
    id: makeTemplateId(name),
    name,
    description: `Vlastní šablona uložená z aktuálního jídelníčku (${dayTypeLabel()}).`,
    targets: getTargets(),
    items: reportToTemplateItems()
  };
  mealTemplates.push(created);
  persistTemplates();
  refreshTemplateSelect();
  $('templateSelect').value = created.id;
  $('newTemplateName').value = '';
  updateTemplatePreview();
  alert(`Nová šablona vytvořena: ${created.name}`);
}

function deleteCurrentTemplate(){
  const template = getSelectedTemplate();
  if(!template) return alert('Nejdřív vyber šablonu, kterou chceš smazat.');
  if(!confirm(`Opravdu smazat šablonu „${template.name}“ z tohoto prohlížeče?`)) return;
  mealTemplates = mealTemplates.filter(t => t.id !== template.id);
  persistTemplates();
  refreshTemplateSelect();
  updateTemplatePreview();
  alert(`Šablona smazána: ${template.name}`);
}

function exportTemplates(){
  const blob = new Blob([JSON.stringify(mealTemplates, null, 2)], {type:'application/json;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'meal-templates-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function resetTemplates(){
  if(!confirm('Vrátit šablony z meal-templates.json? Vlastní uložené šablony v tomto prohlížeči se smažou.')) return;
  localStorage.removeItem('nutritionMealTemplates');
  loadTemplates();
}

function templateTotals(template){
  return (template.items || []).reduce((a,x)=>({
    kcal:a.kcal + Number(x.kcal || 0),
    protein:a.protein + Number(x.protein || 0),
    carbs:a.carbs + Number(x.carbs || 0),
    fat:a.fat + Number(x.fat || 0)
  }), {kcal:0,protein:0,carbs:0,fat:0});
}

function refreshTemplateSelect(){
  if(!$('templateSelect')) return;
  if(!mealTemplates.length){
    $('templateSelect').innerHTML = '<option value="">Šablony nenalezeny</option>';
    updateTemplatePreview();
    return;
  }
  $('templateSelect').innerHTML = mealTemplates
    .map(t => `<option value="${t.id}">${t.name}</option>`)
    .join('');
  updateTemplatePreview();
}

function getSelectedTemplate(){
  const id = $('templateSelect') ? $('templateSelect').value : '';
  return mealTemplates.find(t => t.id === id) || mealTemplates[0];
}

function updateTemplatePreview(){
  if(!$('templatePreview')) return;
  const template = getSelectedTemplate();
  if(!template){
    $('templatePreview').textContent = 'Žádná šablona není načtená.';
    return;
  }
  const t = templateTotals(template);
  const target = template.targets || {};
  $('templatePreview').innerHTML = `
    <strong>${template.name}</strong><br>
    ${template.description || ''}<br>
    <span>Jídla: ${(template.items || []).length} · Součet: ${round(t.kcal)} kcal | B ${round(t.protein)} g | S ${round(t.carbs)} g | T ${round(t.fat)} g</span><br>
    <span>Cíl šablony: ${target.kcal || '-'} kcal | B ${target.protein || '-'} g | S ${target.carbs || '-'} g | T ${target.fat || '-'} g</span><br>
    <span>Tip: načti šablonu, uprav položky v tabulce a tlačítkem „Uložit šablonu“ ji přepiš pod stejným názvem.</span>
  `;
}

function normalizeTemplateItem(item){
  const food = foods.find(f => normalizeText(f.name) === normalizeText(item.name));
  const grams = Number(item.grams || 0);
  if(food && grams > 0){
    return { meal: item.meal || 'Ostatní', name: food.name, grams, ...calc(food, grams) };
  }
  return {
    meal: item.meal || 'Ostatní',
    name: item.name,
    grams,
    kcal: round(Number(item.kcal || 0)),
    protein: round(Number(item.protein || 0)),
    carbs: round(Number(item.carbs || 0)),
    fat: round(Number(item.fat || 0))
  };
}

function applyTemplate(append = false){
  const template = getSelectedTemplate();
  if(!template) return alert('Nejdřív vyber šablonu.');
  const items = (template.items || []).map(normalizeTemplateItem);
  if(!append && getReport().length && !confirm(`Nahradit aktuální jídelníček pro ${dayTypeLabel()} šablonou ${template.name}?`)) return;
  reports[currentDayType] = append ? [...getReport(), ...items] : items;
  if(template.targets){
    targetPresets[currentDayType] = template.targets;
    localStorage.setItem('nutritionTargetPresets', JSON.stringify(targetPresets));
    applyTargetsForDayType();
  }
  save();
  render();
  alert(`${append ? 'Přidáno ze šablony' : 'Načtena šablona'}: ${template.name}`);
}

function recalcItemByGrams(item, newGrams){
  const grams = Number(newGrams);
  if(!item || grams <= 0) return item;
  const food = foods.find(f => normalizeText(f.name) === normalizeText(item.name));
  if(food) return updateAmountLabelForItem({ ...item, grams, ...calc(food, grams) });
  const ratio = item.grams ? grams / item.grams : 1;
  return updateAmountLabelForItem({
    ...item,
    grams,
    kcal: round(item.kcal * ratio),
    protein: round(item.protein * ratio),
    carbs: round(item.carbs * ratio),
    fat: round(item.fat * ratio)
  });
}

function updateItemGrams(index, value){
  const report = getReport();
  report[index] = recalcItemByGrams(report[index], value);
  save();
  render();
}

function updateItemMeal(index, value){
  const report = getReport();
  if(!report[index]) return;
  report[index].meal = value;
  save();
  render();
}

function updateItemFood(index, value){
  const report = getReport();
  if(!report[index]) return;
  const name = String(value || '').trim();
  if(!name) return;
  const food = foods.find(f => normalizeText(f.name) === normalizeText(name));
  report[index].name = food ? food.name : name;
  if(food && Number(report[index].grams) > 0){
    report[index] = updateAmountLabelForItem({ ...report[index], ...calc(food, Number(report[index].grams)) });
  }
  save();
  render();
}

function updateItemMacro(index, field, value){
  const allowed = ['kcal','protein','carbs','fat'];
  if(!allowed.includes(field)) return;
  const report = getReport();
  if(!report[index]) return;
  report[index][field] = round(Number(value) || 0);
  save();
  render();
}

function refreshFoodSelect(){
  refreshFoodSuggestions('');
  updateFoodHint();
}

function refreshFoodSuggestions(query){
  if(!$('foodSuggestions')) return;
  const normalizedQuery = normalizeText(query);
  const filtered = foods
    .filter(f => !normalizedQuery || normalizeText(f.name).startsWith(normalizedQuery))
    .sort((a,b) => Number(isFavoriteFood(b)) - Number(isFavoriteFood(a)) || a.name.localeCompare(b.name, 'cs'))
    .slice(0, 70);

  $('foodSuggestions').innerHTML = filtered
    .map(f => `<option value="${xmlEsc(f.name)}">${isFavoriteFood(f) ? '⭐ ' : ''}${f.kcal} kcal | B ${f.protein} | S ${f.carbs} | T ${f.fat}${f.source === 'custom' ? ' | vlastní' : ''}</option>`)
    .join('');
}

function findFoodBySearch(){
  const value = $('foodSearch').value;
  const normalizedValue = normalizeText(value);
  if(!normalizedValue) return null;

  return foods.find(f => normalizeText(f.name) === normalizedValue)
    || foods.find(f => normalizeText(f.name).startsWith(normalizedValue))
    || foods.find(f => normalizeText(f.name).includes(normalizedValue));
}

function updateUnitOptions(){
  if(!$('unitSelect')) return;
  const food = findFoodBySearch();
  const current = $('unitSelect').value || 'g';
  const pieceWeight = Number(food?.pieceWeight || 0);
  const pieceName = food?.pieceName || 'ks';
  const baseUnit = amountUnitForFood(food);
  $('unitSelect').innerHTML = `<option value="g">${baseUnit}</option>` + (pieceWeight > 0 ? `<option value="piece">${pieceName}</option>` : '');
  $('unitSelect').value = pieceWeight > 0 && current === 'piece' ? 'piece' : 'g';
  if($('unitHint')){
    $('unitHint').textContent = pieceWeight > 0
      ? `Lze zadat ${baseUnit} nebo ${pieceName}. 1 ${pieceName} ≈ ${pieceWeight} g.`
      : `Tato potravina se počítá v ${baseUnit}.`;
  }
}

function updateFoodHint(){
  if(!$('foodHint')) return;
  const food = findFoodBySearch();
  updateUnitOptions();
  updateFavoriteButton();
  if(food) fillCustomFoodForm(food, false);
  $('foodHint').textContent = food
    ? `${isFavoriteFood(food) ? '⭐ ' : ''}Vybráno: ${food.name} | ${food.kcal} kcal, B ${food.protein} g, S ${food.carbs} g, T ${food.fat} g / 100 g${food.pieceWeight ? ` · 1 ${food.pieceName || 'ks'} ≈ ${food.pieceWeight} g` : ''}`
    : 'Začni psát název potraviny. Oblíbené položky se řadí nahoře.';
}

function validateFoods(data){
  if(!Array.isArray(data)) throw new Error('Soubor musí obsahovat JSON pole potravin.');
  return data.map((f, index) => {
    const name = String(f.name || '').trim();
    const kcal = Number(f.kcal);
    const protein = Number(f.protein);
    const carbs = Number(f.carbs);
    const fat = Number(f.fat);

    if(!name) throw new Error(`Potravina na řádku ${index + 1} nemá název name.`);
    if([kcal, protein, carbs, fat].some(Number.isNaN)){
      throw new Error(`Potravina ${name} nemá správně vyplněné kcal/protein/carbs/fat.`);
    }

    return {
      id: f.id || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name,
      category: f.category || 'Import',
      kcal,
      protein,
      carbs,
      fat,
      unit: f.unit || '100g',
      pieceName: f.pieceName || undefined,
      pieceWeight: f.pieceWeight ? Number(f.pieceWeight) : undefined,
      source: f.source || 'import'
    };
  });
}

async function importFoods(event){
  const file = event.target.files[0];
  if(!file) return;

  try{
    const text = await file.text();
    const imported = validateFoods(JSON.parse(text));
    localStorage.setItem('nutritionFoods', JSON.stringify(imported));
    foods = mergeDefaultFoods(customFoods, imported);
    refreshFoodSelect();
    updateImportStatus(`Import hotový: ${foods.length} potravin ze souboru ${file.name}.`);
    alert(`Import hotový: ${foods.length} potravin.`);
  }catch(error){
    updateImportStatus(`Chyba importu: ${error.message}`, true);
    alert(`Soubor se nepodařilo načíst: ${error.message}`);
  }finally{
    event.target.value = '';
  }
}

function exportFoods(){
  const blob = new Blob([JSON.stringify(foods, null, 2)], {type:'application/json;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'foods-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function updateFavoriteButton(){
  const btn = $('favoriteFoodBtn');
  if(!btn) return;
  const food = findFoodBySearch();
  btn.textContent = food && isFavoriteFood(food) ? '★ Odebrat z oblíbených' : '☆ Přidat do oblíbených';
  btn.disabled = !food;
}

function toggleFavoriteFood(){
  const food = findFoodBySearch();
  if(!food) return alert('Nejdřív vyber potravinu.');
  const key = foodKey(food);
  if(isFavoriteFood(food)){
    favoriteFoodKeys = favoriteFoodKeys.filter(k => k !== key);
  }else{
    favoriteFoodKeys.push(key);
  }
  saveFavorites();
  refreshFoodSuggestions($('foodSearch')?.value || '');
  updateFoodHint();
}

function getCustomFoodFromForm(){
  const name = ($('customFoodName')?.value || '').trim();
  const kcal = Number($('customFoodKcal')?.value);
  const protein = Number($('customFoodProtein')?.value);
  const carbs = Number($('customFoodCarbs')?.value);
  const fat = Number($('customFoodFat')?.value);
  const pieceName = ($('customFoodPieceName')?.value || '').trim();
  const pieceWeight = Number($('customFoodPieceWeight')?.value || 0);
  if(!name) throw new Error('Vyplň název potraviny.');
  if([kcal, protein, carbs, fat].some(Number.isNaN)) throw new Error('Vyplň kcal, bílkoviny, sacharidy a tuky.');
  return {
    id: `custom-${foodKey(name).replace(/[^a-z0-9]+/g, '-')}`,
    name,
    category: ($('customFoodCategory')?.value || 'Vlastní').trim() || 'Vlastní',
    kcal: round(kcal),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    unit: '100g',
    pieceName: pieceName || undefined,
    pieceWeight: pieceWeight > 0 ? round(pieceWeight) : undefined,
    source: 'custom'
  };
}

function fillCustomFoodForm(food, force = true){
  if(!food || !$('customFoodName')) return;
  if(!force && document.activeElement && String(document.activeElement.id || '').startsWith('customFood')) return;
  $('customFoodName').value = food.name || '';
  $('customFoodCategory').value = food.category || '';
  $('customFoodKcal').value = food.kcal ?? '';
  $('customFoodProtein').value = food.protein ?? '';
  $('customFoodCarbs').value = food.carbs ?? '';
  $('customFoodFat').value = food.fat ?? '';
  $('customFoodPieceName').value = food.pieceName || '';
  $('customFoodPieceWeight').value = food.pieceWeight || '';
  if($('customFoodStatus')) $('customFoodStatus').textContent = food.source === 'custom' ? 'Načtena vlastní potravina k úpravě.' : 'Načtena potravina z databáze. Uložením vznikne/aktualizuje se vlastní položka.';
}

function clearCustomFoodForm(){
  ['customFoodName','customFoodCategory','customFoodKcal','customFoodProtein','customFoodCarbs','customFoodFat','customFoodPieceName','customFoodPieceWeight'].forEach(id => { if($(id)) $(id).value = ''; });
  if($('customFoodStatus')) $('customFoodStatus').textContent = 'Formulář je prázdný. Vyplň hodnoty na 100 g.';
}

function saveCustomFood(){
  try{
    const food = getCustomFoodFromForm();
    const key = foodKey(food);
    customFoods = customFoods.filter(f => foodKey(f) !== key);
    customFoods.push(food);
    localStorage.setItem('nutritionCustomFoods', JSON.stringify(customFoods));
    refreshFoodDatabase();
    $('foodSearch').value = food.name;
    updateFoodHint();
    if($('customFoodStatus')) $('customFoodStatus').textContent = `Vlastní potravina uložena: ${food.name}.`;
    alert(`Potravina uložena: ${food.name}`);
  }catch(error){
    alert(error.message);
  }
}

function deleteCustomFood(){
  const name = ($('customFoodName')?.value || $('foodSearch')?.value || '').trim();
  if(!name) return alert('Vyber nebo napiš vlastní potravinu ke smazání.');
  const key = foodKey(name);
  const exists = customFoods.some(f => foodKey(f) === key);
  if(!exists) return alert('Tato položka není uložená jako vlastní potravina.');
  if(!confirm(`Smazat vlastní potravinu „${name}“?`)) return;
  customFoods = customFoods.filter(f => foodKey(f) !== key);
  localStorage.setItem('nutritionCustomFoods', JSON.stringify(customFoods));
  favoriteFoodKeys = favoriteFoodKeys.filter(k => k !== key);
  saveFavorites();
  refreshFoodDatabase();
  clearCustomFoodForm();
}

function resetFoods(){
  if(!confirm('Vrátit původní databázi z foods.json? Importovaná databáze v tomto prohlížeči se smaže.')) return;
  localStorage.removeItem('nutritionFoods');
  foods = mergeDefaultFoods(customFoods, defaultFoods);
  refreshFoodSelect();
  updateImportStatus('Načtena původní databáze z foods.json.');
  render();
}

function updateImportStatus(message){
  if(!$('importStatus')) return;
  $('importStatus').textContent = `${message} Aktuálně načteno: ${foods.length} potravin.`;
}

function calc(food, grams){
  const k = grams / 100;
  return {
    kcal: round(food.kcal * k), protein: round(food.protein * k), carbs: round(food.carbs * k), fat: round(food.fat * k)
  };
}

function getReport(type = currentDayType){
  if(!reports[type]) reports[type] = [];
  return reports[type];
}

function save(){
  localStorage.setItem('nutritionReportsByDayType', JSON.stringify(reports));
  localStorage.setItem('nutritionReport', JSON.stringify(getReport()));
}

function dayTypeLabel(type = currentDayType){
  return type === 'training' ? 'Tréninkový den' : 'Netréninkový den';
}

function getTargets(type = currentDayType){
  if(type === currentDayType && $('targetKcal')){
    return {
      kcal: Number($('targetKcal').value),
      protein: Number($('targetProtein').value),
      carbs: Number($('targetCarbs').value),
      fat: Number($('targetFat').value)
    };
  }
  return targetPresets[type] || targetPresets.training;
}

function applyTargetsForDayType(){
  const preset = targetPresets[currentDayType] || targetPresets.training;
  $('targetKcal').value = preset.kcal;
  $('targetProtein').value = preset.protein;
  $('targetCarbs').value = preset.carbs;
  $('targetFat').value = preset.fat;
  updateDayTypeHint();
  render();
}

function saveTargetsForDayType(){
  targetPresets[currentDayType] = getTargets();
  localStorage.setItem('nutritionTargetPresets', JSON.stringify(targetPresets));
  updateDayTypeHint('Cíle uloženy.');
}

function updateDayTypeHint(prefix = ''){
  if(!$('dayTypeHint')) return;
  const t = targetPresets[currentDayType] || getTargets();
  const count = getReport().length;
  $('dayTypeHint').textContent = `${prefix ? prefix + ' ' : ''}${dayTypeLabel()}: ${t.kcal} kcal | B ${t.protein} g | S ${t.carbs} g | T ${t.fat} g · jídel v tomto typu dne: ${count}`;
}

function changeDayType(){
  currentDayType = $('dayType').value;
  localStorage.setItem('nutritionDayType', currentDayType);
  applyTargetsForDayType();
}


function setGeneratorStatus(message, isError = false){
  if(!$('generatorStatus')) return;
  $('generatorStatus').textContent = message;
  $('generatorStatus').classList.toggle('error-text', isError);
}

function findFoodSmart(names, dietMode = 'classic'){
  const candidates = Array.isArray(names) ? names : [names];
  const pool = foods.slice().sort((a,b) => dietFoodScore(b, dietMode) - dietFoodScore(a, dietMode));
  for(const name of candidates){
    const exact = pool.find(f => normalizeText(f.name) === normalizeText(name));
    if(exact) return exact;
  }
  for(const name of candidates){
    const starts = pool.find(f => normalizeText(f.name).startsWith(normalizeText(name)));
    if(starts) return starts;
  }
  for(const name of candidates){
    const contains = pool.find(f => normalizeText(f.name).includes(normalizeText(name)));
    if(contains) return contains;
  }
  return null;
}

function foodTags(food){
  return Array.isArray(food?.tags) ? food.tags.map(normalizeText) : [];
}

function dietFoodScore(food, dietMode){
  const name = normalizeText(food?.name);
  const tags = foodTags(food);
  if(dietMode === 'glutenfree') return Number(tags.includes('bezlepkove') || name.includes('bezlepk')) * 10;
  if(dietMode === 'lactosefree') return Number(tags.includes('bezlaktozove') || name.includes('bez laktozy') || name.includes('bezlakt')) * 10;
  return 0;
}

function generatedFoodItem(meal, names, grams, role = '', min = 0, max = 999, dietMode = 'classic'){
  const food = findFoodSmart(names, dietMode);
  if(!food) return null;
  const safeGrams = Math.max(min || 0, Math.min(max || 999, round(Number(grams) || 0)));
  return updateAmountLabelForItem({ meal, name: food.name, grams: safeGrams, role, min, max, amount: safeGrams, unitMode: amountUnitForFood(food), ...calc(food, safeGrams) });
}

function generatorBlueprint(){
  const count = Number($('generatorMealsCount')?.value || 6);
  const style = $('generatorStyle')?.value || 'fitness';
  const carbSource = $('generatorCarbSource')?.value || 'rice';
  const proteinSource = $('generatorProteinSource')?.value || 'chicken';
  const dietMode = $('generatorDietMode')?.value || 'classic';
  const breakfastCarbNames = dietMode === 'glutenfree' ? ['Bezlepkové ovesné vločky','Rýžová kaše instantní natural','Rýžová kaše bezlepková'] : ['Ovesné vločky','Ovesné vločky jemné'];
  const morningProteinNames = dietMode === 'lactosefree' ? ['Whey isolate bez laktózy','Protein whey isolate bez laktózy','Rýžový protein'] : ['Whey protein','Syrovátkový protein whey 80%'];
  const dairySnackNames = dietMode === 'lactosefree' ? ['Skyr bez laktózy','Tvaroh bez laktózy','Jogurt řecký bez laktózy'] : ['Skyr','Skyr bílý','Tvaroh nízkotučný'];
  const snackCarbNames = dietMode === 'glutenfree' ? ['Rýžová kaše bezlepková','Rýžová kaše instantní natural'] : ['Rýžová kaše instantní natural','Rýžová kaše vanilková'];
  const proteinMain = proteinSource === 'turkey' ? 'Krůtí mleté 2% Lidl' : proteinSource === 'mixed' ? ['Kuřecí prsa syrová','Krůtí mleté 2% Lidl'] : 'Kuřecí prsa syrová';
  const lunchCarb = carbSource === 'potatoes' ? 'Brambory vařené' : 'Rýže basmati suchá';
  const dinnerCarb = carbSource === 'rice' ? 'Rýže basmati suchá' : 'Batáty syrové';
  const fatOil = style === 'diet' ? 3 : style === 'bulk' ? 12 : 8;

  const items = [
    generatedFoodItem('Snídaně', breakfastCarbNames, style === 'bulk' ? 90 : 70, 'carb', 30, 160, dietMode),
    generatedFoodItem('Snídaně', morningProteinNames, 30, 'protein', 15, 60, dietMode),
    generatedFoodItem('Snídaně', 'Vejce celé', style === 'diet' ? 50 : 100, 'fat', 0, 200, dietMode),
    generatedFoodItem('Snídaně', 'Med', style === 'bulk' ? 20 : 10, 'carb', 0, 60, dietMode),

    generatedFoodItem('Svačina', dairySnackNames, 250, 'protein', 100, 500, dietMode),
    generatedFoodItem('Svačina', ['Banán','Banán čerstvý'], style === 'diet' ? 80 : 120, 'carb', 0, 250, dietMode),

    generatedFoodItem('Oběd', proteinMain, style === 'bulk' ? 230 : 200, 'protein', 100, 350, dietMode),
    generatedFoodItem('Oběd', lunchCarb, style === 'bulk' ? 110 : 80, 'carb', 30, 180, dietMode),
    generatedFoodItem('Oběd', ['Zelenina mix','Zelenina mix mražená'], 200, 'veg', 100, 400, dietMode),
    generatedFoodItem('Oběd', 'Olivový olej', fatOil, 'fat', 0, 30, dietMode),

    generatedFoodItem('Odpolední svačina', snackCarbNames, style === 'bulk' ? 80 : 55, 'carb', 20, 140, dietMode),
    generatedFoodItem('Odpolední svačina', morningProteinNames, 30, 'protein', 15, 60, dietMode),

    generatedFoodItem('Večeře', proteinSource === 'mixed' ? 'Losos syrový' : proteinMain, style === 'diet' ? 180 : 220, 'protein', 100, 350, dietMode),
    generatedFoodItem('Večeře', dinnerCarb, style === 'bulk' ? 300 : 220, 'carb', 80, 500, dietMode),
    generatedFoodItem('Večeře', ['Chřest','Brokolice','Zelenina mix'], 150, 'veg', 80, 350, dietMode),
    generatedFoodItem('Večeře', 'Olivový olej', style === 'diet' ? 0 : 6, 'fat', 0, 25, dietMode)
  ].filter(Boolean);

  if(count >= 6){
    items.push(
      generatedFoodItem('Druhá večeře', dairySnackNames, 250, 'protein', 100, 500, dietMode),
      generatedFoodItem('Druhá večeře', style === 'bulk' ? ['Hořká čokoláda 85 %','Čokoláda hořká 85 %'] : 'Mandle', style === 'bulk' ? 20 : 15, 'fat', 0, 50, dietMode)
    );
  }else{
    items.push(generatedFoodItem('Svačina', ['Rýžové chlebíčky natural','Rýžové chlebíčky'], style === 'bulk' ? 40 : 20, 'carb', 0, 80, dietMode));
  }

  return items.filter(Boolean);
}

function recalcGenerated(items){
  return items.map(item => {
    const food = findFoodSmart(item.name);
    return food ? updateAmountLabelForItem({ ...item, amount: item.grams, ...calc(food, item.grams) }) : updateAmountLabelForItem(item);
  });
}

function adjustGeneratedMacro(items, macro, desiredDelta, roles){
  if(Math.abs(desiredDelta) < 1) return items;
  const adjustable = items.filter(item => roles.includes(item.role)).map(item => {
    const food = findFoodSmart(item.name);
    const perGram = food ? Number(food[macro] || 0) / 100 : 0;
    const room = desiredDelta > 0 ? (Number(item.max || 999) - Number(item.grams || 0)) : (Number(item.grams || 0) - Number(item.min || 0));
    return { item, food, perGram, room };
  }).filter(x => x.food && x.perGram > 0 && x.room > 0);
  if(!adjustable.length) return items;

  let remaining = desiredDelta;
  for(const entry of adjustable){
    const rawGrams = remaining / entry.perGram / Math.max(1, adjustable.length);
    const step = rawGrams >= 0 ? Math.min(rawGrams, entry.room) : -Math.min(Math.abs(rawGrams), entry.room);
    entry.item.grams = Math.max(Number(entry.item.min || 0), Math.min(Number(entry.item.max || 999), round((Number(entry.item.grams) || 0) + step)));
  }
  return recalcGenerated(items);
}

function generateMealPlan(append = false){
  if(!foods.length) return alert('Nejdřív musí být načtená databáze potravin.');
  const targets = getTargets();
  let items = recalcGenerated(generatorBlueprint());

  for(let i = 0; i < 7; i++){
    const current = items.reduce((a,x)=>({kcal:a.kcal+x.kcal, protein:a.protein+x.protein, carbs:a.carbs+x.carbs, fat:a.fat+x.fat}), {kcal:0, protein:0, carbs:0, fat:0});
    items = adjustGeneratedMacro(items, 'protein', Number(targets.protein || 0) - current.protein, ['protein']);
    const afterProtein = items.reduce((a,x)=>({kcal:a.kcal+x.kcal, protein:a.protein+x.protein, carbs:a.carbs+x.carbs, fat:a.fat+x.fat}), {kcal:0, protein:0, carbs:0, fat:0});
    items = adjustGeneratedMacro(items, 'carbs', Number(targets.carbs || 0) - afterProtein.carbs, ['carb']);
    const afterCarbs = items.reduce((a,x)=>({kcal:a.kcal+x.kcal, protein:a.protein+x.protein, carbs:a.carbs+x.carbs, fat:a.fat+x.fat}), {kcal:0, protein:0, carbs:0, fat:0});
    items = adjustGeneratedMacro(items, 'fat', Number(targets.fat || 0) - afterCarbs.fat, ['fat']);
  }

  items = recalcGenerated(items).map(item => ({...item, grams: Math.max(1, Math.round(item.grams / 5) * 5)}));
  items = recalcGenerated(items);
  if(!append && getReport().length && !confirm(`Nahradit aktuální jídelníček pro ${dayTypeLabel()} automaticky vygenerovaným návrhem?`)) return;
  reports[currentDayType] = append ? [...getReport(), ...items] : items;
  save();
  render();
  const t = totals();
  setGeneratorStatus(`Vygenerováno pro ${dayTypeLabel()}: ${round(t.kcal)} kcal | B ${round(t.protein)} g | S ${round(t.carbs)} g | T ${round(t.fat)} g. Gramy můžeš dál upravovat v tabulce.`);
}

function addFood(){
  const food = findFoodBySearch();
  const amount = Number($('gramsInput').value);
  const unitMode = $('unitSelect') ? $('unitSelect').value : 'g';
  if(!food || amount <= 0) return alert('Zadej platnou potravinu a množství.');
  const pieceWeight = Number(food.pieceWeight || 0);
  const pieceName = food.pieceName || 'ks';
  const grams = unitMode === 'piece' && pieceWeight > 0 ? round(amount * pieceWeight) : amount;
  const amountLabel = unitMode === 'piece' && pieceWeight > 0 ? `${amount} ${pieceName} / ${formatAmount(food, grams)}` : formatAmount(food, grams);
  getReport().push({ meal: $('mealType').value, name: food.name, grams, amount, unitMode, pieceName, pieceWeight, amountLabel, ...calc(food, grams) });
  $('foodSearch').value = '';
  if($('unitSelect')) $('unitSelect').innerHTML = '<option value="g">g</option>';
  refreshFoodSuggestions('');
  updateFoodHint();
  save(); render();
}

function removeItem(index){ getReport().splice(index,1); save(); render(); }

function sortedReport(type = currentDayType){
  return getReport(type)
    .map((item, index) => ({...item, originalIndex: index}))
    .sort((a,b) => {
      const orderA = mealOrder.indexOf(a.meal);
      const orderB = mealOrder.indexOf(b.meal);
      const safeA = orderA === -1 ? 999 : orderA;
      const safeB = orderB === -1 ? 999 : orderB;
      return safeA - safeB || a.originalIndex - b.originalIndex;
    });
}

function totals(type = currentDayType){
  return getReport(type).reduce((a,x)=>({kcal:a.kcal+x.kcal, protein:a.protein+x.protein, carbs:a.carbs+x.carbs, fat:a.fat+x.fat}), {kcal:0,protein:0,carbs:0,fat:0});
}

function metric(label, value, target, unit=''){
  const numericValue = Number(value) || 0;
  const numericTarget = Number(target) || 0;
  const rawPct = numericTarget ? Math.round(numericValue / numericTarget * 100) : 0;
  const pct = Math.min(100, rawPct);
  const exceeded = numericTarget > 0 && numericValue > numericTarget;
  const diff = numericTarget ? round(numericTarget - numericValue) : 0;
  const status = exceeded ? `Přesah: ${round(numericValue - numericTarget)}${unit}` : `Zbývá: ${diff}${unit}`;
  const fillStyle = exceeded ? `width:${pct}%;background:#dc2626;` : `width:${pct}%`;

  return `<div class="metric ${exceeded ? 'over-limit over-target' : ''}" data-exceeded="${exceeded}">
    <span>${label}</span>
    <strong>${round(numericValue)}${unit}</strong>
    <span>Cíl: ${numericTarget}${unit} · ${rawPct}%</span>
    <em>${status}</em>
    <div class="bar"><div class="fill" style="${fillStyle}"></div></div>
  </div>`;
}

function mealTotals(items){
  return items.reduce((a,x)=>({
    kcal:a.kcal+x.kcal,
    protein:a.protein+x.protein,
    carbs:a.carbs+x.carbs,
    fat:a.fat+x.fat
  }), {kcal:0,protein:0,carbs:0,fat:0});
}

function mealOptionsHtml(selected){
  return mealOrder.map(meal => `<option ${meal === selected ? 'selected' : ''}>${meal}</option>`).join('') + `<option ${!mealOrder.includes(selected) ? 'selected' : ''}>Ostatní</option>`;
}

function replacementScore(currentFood, candidate){
  const categoryBonus = normalizeText(currentFood?.category) === normalizeText(candidate?.category) ? -35 : 0;
  const kcalDiff = Math.abs(Number(currentFood?.kcal || 0) - Number(candidate?.kcal || 0)) / 8;
  const proteinDiff = Math.abs(Number(currentFood?.protein || 0) - Number(candidate?.protein || 0)) * 1.5;
  const carbsDiff = Math.abs(Number(currentFood?.carbs || 0) - Number(candidate?.carbs || 0));
  const fatDiff = Math.abs(Number(currentFood?.fat || 0) - Number(candidate?.fat || 0)) * 1.4;
  return categoryBonus + kcalDiff + proteinDiff + carbsDiff + fatDiff;
}

function getReplacementCandidates(item){
  const currentFood = findFoodSmart(item.name) || {name:item.name, kcal:item.kcal, protein:item.protein, carbs:item.carbs, fat:item.fat};
  const currentKey = foodKey(item.name);
  return foods
    .filter(f => foodKey(f) !== currentKey)
    .filter(f => {
      const sameCategory = normalizeText(f.category) === normalizeText(currentFood.category);
      const sameMacroProfile = Math.abs(Number(f.protein || 0) - Number(currentFood.protein || 0)) <= 12
        && Math.abs(Number(f.carbs || 0) - Number(currentFood.carbs || 0)) <= 25
        && Math.abs(Number(f.fat || 0) - Number(currentFood.fat || 0)) <= 15;
      return sameCategory || sameMacroProfile;
    })
    .sort((a,b) => replacementScore(currentFood, a) - replacementScore(currentFood, b))
    .slice(0, 9);
}

function showReplacements(index){
  const report = getReport();
  const item = report[index];
  if(!item) return;
  const candidates = getReplacementCandidates(item);
  if(!candidates.length) return alert('Pro tuto potravinu jsem nenašel vhodné náhrady.');
  const text = candidates.map((f, i) => `${i + 1}) ${f.name} | ${f.kcal} kcal | B ${f.protein} | S ${f.carbs} | T ${f.fat}`).join('\n');
  const choice = prompt(`Náhrady pro: ${item.name}\nZadej číslo náhrady:\n\n${text}`);
  if(!choice) return;
  const selected = candidates[Number(choice) - 1];
  if(!selected) return alert('Neplatná volba náhrady.');
  const grams = Number(item.grams || 0);
  report[index] = { ...item, name: selected.name, grams, amount: grams, unitMode: 'g', amountLabel: `${grams} g`, ...calc(selected, grams) };
  save();
  render();
}

function renderEditableRow(x){
  return `<tr class="meal-item">
    <td><select class="table-select" onchange="updateItemMeal(${x.originalIndex}, this.value)">${mealOptionsHtml(x.meal)}</select></td>
    <td><input class="food-edit" type="text" list="foodSuggestions" value="${xmlEsc(x.name)}" onchange="updateItemFood(${x.originalIndex}, this.value)"></td>
    <td><input class="grams-edit" type="number" min="1" value="${x.grams}" onchange="updateItemGrams(${x.originalIndex}, this.value)">${x.amountLabel && x.amountLabel !== formatAmount(x.name, x.grams) ? `<span class="amount-label">${xmlEsc(x.amountLabel)}</span>` : ''}</td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.kcal}" onchange="updateItemMacro(${x.originalIndex}, 'kcal', this.value)"></td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.protein}" onchange="updateItemMacro(${x.originalIndex}, 'protein', this.value)"></td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.carbs}" onchange="updateItemMacro(${x.originalIndex}, 'carbs', this.value)"></td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.fat}" onchange="updateItemMacro(${x.originalIndex}, 'fat', this.value)"></td>
    <td class="row-actions"><button class="secondary tiny-btn" onclick="showReplacements(${x.originalIndex})" type="button">Náhrady</button><button class="tiny-btn" onclick="removeItem(${x.originalIndex})" type="button">X</button></td>
  </tr>`;
}

function renderReportRows(){
  const data = sortedReport();
  if(!data.length){
    return `<tr class="empty-row"><td colspan="8">Zatím není přidané žádné jídlo pro ${dayTypeLabel().toLowerCase()}.</td></tr>`;
  }

  const knownMealRows = mealOrder.map(meal => {
    const items = data.filter(x => x.meal === meal);
    if(!items.length) return '';
    const mt = mealTotals(items);
    const header = `<tr class="meal-divider"><td colspan="8">
      <div class="meal-title"><strong>${meal}</strong><span>${round(mt.kcal)} kcal · B ${round(mt.protein)} g · S ${round(mt.carbs)} g · T ${round(mt.fat)} g</span></div>
    </td></tr>`;
    const rows = items.map((x)=>renderEditableRow(x)).join('');
    return header + rows;
  }).join('');

  const otherItems = data.filter(x => !mealOrder.includes(x.meal));
  const otherRows = otherItems.length ? (() => {
    const mt = mealTotals(otherItems);
    const header = `<tr class="meal-divider"><td colspan="8"><div class="meal-title"><strong>Ostatní</strong><span>${round(mt.kcal)} kcal · B ${round(mt.protein)} g · S ${round(mt.carbs)} g · T ${round(mt.fat)} g</span></div></td></tr>`;
    const rows = otherItems.map((x)=>renderEditableRow(x)).join('');
    return header + rows;
  })() : '';

  return knownMealRows + otherRows;
}

function render(){
  const t = totals();
  const targets = getTargets();
  $('summary').innerHTML = [
    metric('Kalorie', t.kcal, targets.kcal, ' kcal'),
    metric('Bílkoviny', t.protein, targets.protein, ' g'),
    metric('Sacharidy', t.carbs, targets.carbs, ' g'),
    metric('Tuky', t.fat, targets.fat, ' g')
  ].join('');

  $('reportBody').innerHTML = renderReportRows();
  $('textReport').value = buildTextReport(t);
  updateDayTypeHint();
}

function buildTextReport(t){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const name = ($('clientName')?.value || '').trim();
  const lines = [`Denní report ${date}`, name ? `Jméno: ${name}` : '', `Typ dne: ${dayTypeLabel()}`, '', ...sortedReport().map(x => `${x.meal}: ${x.name} ${x.amountLabel || (x.grams + ' g')} | ${x.kcal} kcal | B ${x.protein} g | S ${x.carbs} g | T ${x.fat} g`), '', `CELKEM: ${round(t.kcal)} kcal | B ${round(t.protein)} g | S ${round(t.carbs)} g | T ${round(t.fat)} g`].filter(line => line !== null);
  return lines.join('\n');
}

function copyReport(){ navigator.clipboard.writeText($('textReport').value); alert('Report zkopírován.'); }

function safeFileName(value){
  return String(value || 'jidelnicek')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'jidelnicek';
}

function dateForFile(){
  return $('reportDate').value || new Date().toISOString().slice(0,10);
}

function exportCsv(){
  const rows = [['Jméno', ($('clientName')?.value || '').trim()], ['Typ dne', dayTypeLabel()], [], ['Jídlo','Potravina','Množství','Kcal','Bílkoviny','Sacharidy','Tuky'], ...sortedReport().map(x=>[x.meal,x.name,x.amountLabel || (x.grams + ' g'),x.kcal,x.protein,x.carbs,x.fat])];
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safeFileName(($('clientName')?.value || 'jidelnicek'))}-${dateForFile()}.csv`; a.click();
}

function xmlEsc(v){
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cell(value, type = 'String', style = ''){
  const safeType = type === 'Number' ? 'Number' : 'String';
  const styleAttr = style ? ` ss:StyleID="${style}"` : '';
  return `<Cell${styleAttr}><Data ss:Type="${safeType}">${xmlEsc(value)}</Data></Cell>`;
}

function row(values, style = ''){
  return `<Row>${values.map(v => Array.isArray(v) ? cell(v[0], v[1], v[2] || style) : cell(v, 'String', style)).join('')}</Row>`;
}

function groupedMealsForPdf(type = currentDayType){
  const data = sortedReport(type);
  return mealOrder.map(meal => ({ meal, items: data.filter(x => x.meal === meal), totals: mealTotals(data.filter(x => x.meal === meal)) }))
    .filter(group => group.items.length);
}

function macroCardsHtml(type = currentDayType){
  const t = totals(type);
  const targets = getTargets(type);
  const items = [
    ['Kalorie', t.kcal, targets.kcal, 'kcal'],
    ['Bílkoviny', t.protein, targets.protein, 'g'],
    ['Sacharidy', t.carbs, targets.carbs, 'g'],
    ['Tuky', t.fat, targets.fat, 'g']
  ];
  return items.map(([label, value, target, unit]) => {
    const over = Number(value) > Number(target);
    const delta = round(Number(target) - Number(value));
    return `<div class="pdf-macro ${over ? 'over' : ''}"><span>${label}</span><strong>${round(value)} ${unit}</strong><small>Cíl ${target} ${unit} · ${over ? 'Přesah ' + Math.abs(delta) : 'Zbývá ' + delta} ${unit}</small></div>`;
  }).join('');
}

function pdfMealSectionsHtml(type){
  const groups = groupedMealsForPdf(type);
  if(!groups.length){
    return '<div class="pdf-empty">Jídelníček pro tento den je zatím prázdný.</div>';
  }
  return groups.map(group => `
    <section class="pdf-meal">
      <div class="pdf-meal-title">
        <h3>${xmlEsc(group.meal)}</h3>
        <span>${round(group.totals.kcal)} kcal · B ${round(group.totals.protein)} g · S ${round(group.totals.carbs)} g · T ${round(group.totals.fat)} g</span>
      </div>
      <table>
        <thead><tr><th>Potravina</th><th>Množství</th><th>kcal</th><th>B</th><th>S</th><th>T</th></tr></thead>
        <tbody>${group.items.map(x => `<tr><td>${xmlEsc(x.name)}</td><td>${xmlEsc(x.amountLabel || (x.grams + ' g'))}</td><td>${round(x.kcal)}</td><td>${round(x.protein)}</td><td>${round(x.carbs)}</td><td>${round(x.fat)}</td></tr>`).join('')}</tbody>
      </table>
    </section>`).join('');
}

function pdfDayBlock(type){
  const t = totals(type);
  const targets = getTargets(type);
  return `
    <section class="pdf-day ${type === 'rest' ? 'page-break' : ''}">
      <div class="pdf-day-head">
        <div>
          <div class="pdf-kicker">Jídelníček</div>
          <h2>${xmlEsc(dayTypeLabel(type))}</h2>
        </div>
        <div class="pdf-total-pill">${round(t.kcal)} / ${targets.kcal} kcal</div>
      </div>
      <div class="pdf-macros">${macroCardsHtml(type)}</div>
      ${pdfMealSectionsHtml(type)}
    </section>`;
}


function loadImageDataUrl(src){
  return fetch(src)
    .then(res => {
      if(!res.ok) throw new Error('Obrázek pro PDF se nepodařilo načíst.');
      return res.blob();
    })
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

function fitImageSize(imgWidth, imgHeight, boxWidth, boxHeight){
  const ratio = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);
  return { width: imgWidth * ratio, height: imgHeight * ratio };
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight, options = {}){
  const lines = doc.splitTextToSize(String(text || ''), maxWidth);
  doc.text(lines, x, y, options);
  return y + (lines.length * lineHeight);
}

function pdfMacroRowData(type){
  const t = totals(type);
  const targets = getTargets(type);
  return [
    ['Kalorie', round(t.kcal), targets.kcal, 'kcal'],
    ['Bílkoviny', round(t.protein), targets.protein, 'g'],
    ['Sacharidy', round(t.carbs), targets.carbs, 'g'],
    ['Tuky', round(t.fat), targets.fat, 'g']
  ];
}

function drawMacroCards(doc, type, x, y, w){
  const cards = pdfMacroRowData(type);
  const gap = 4;
  const cardW = (w - gap * 3) / 4;
  cards.forEach(([label, value, target, unit], i) => {
    const cx = x + i * (cardW + gap);
    const over = Number(value) > Number(target);
    doc.setDrawColor(over ? 248 : 209, over ? 113 : 221, over ? 113 : 238);
    doc.setFillColor(over ? 255 : 248, over ? 245 : 251, over ? 245 : 255);
    doc.roundedRect(cx, y, cardW, 23, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 112, 133);
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), cx + 4, y + 6);
    doc.setFontSize(13);
    doc.setTextColor(over ? 220 : 16, over ? 38 : 24, over ? 38 : 40);
    doc.text(`${value} ${unit}`, cx + 4, y + 14);
    doc.setFontSize(7.5);
    const delta = round(Number(target) - Number(value));
    doc.setTextColor(over ? 220 : 18, over ? 38 : 183, over ? 38 : 106);
    doc.text(`${over ? 'Přesah' : 'Zbývá'} ${Math.abs(delta)} ${unit}`, cx + 4, y + 20);
  });
}

function drawMealTable(doc, type, startY){
  const left = 14;
  const pageW = 210;
  const right = 14;
  const maxY = 282;
  let y = startY;
  const groups = groupedMealsForPdf(type);

  if(!groups.length){
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(left, y, pageW - left - right, 16, 4, 4, 'FD');
    doc.setTextColor(102, 112, 133);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.text('Jídelníček pro tento den je zatím prázdný.', pageW / 2, y + 10, {align:'center'});
    return y + 22;
  }

  groups.forEach(group => {
    const needed = 18 + group.items.length * 8 + 8;
    if(y + needed > maxY){ doc.addPage(); y = 16; }

    doc.setFillColor(16, 24, 40);
    doc.setDrawColor(16, 24, 40);
    doc.roundedRect(left, y, pageW - left - right, 12, 3, 3, 'FD');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text(group.meal, left + 4, y + 8);
    doc.setFontSize(7.5);
    doc.setTextColor(208, 213, 221);
    doc.text(`${round(group.totals.kcal)} kcal · B ${round(group.totals.protein)} g · S ${round(group.totals.carbs)} g · T ${round(group.totals.fat)} g`, pageW - right - 4, y + 8, {align:'right'});
    y += 12;

    const cols = [left, left + 83, left + 112, left + 130, left + 148, left + 166];
    doc.setFillColor(242, 246, 255);
    doc.rect(left, y, pageW - left - right, 8, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica','bold');
    doc.setTextColor(52, 64, 84);
    ['Potravina','Množství','kcal','B','S','T'].forEach((h,i)=> doc.text(h, cols[i]+2, y+5.3));
    y += 8;

    doc.setFont('helvetica','normal');
    doc.setFontSize(8.6);
    group.items.forEach((item, idx) => {
      if(y + 8 > maxY){ doc.addPage(); y = 16; }
      if(idx % 2 === 1){ doc.setFillColor(251,253,255); doc.rect(left, y, pageW - left - right, 8, 'F'); }
      doc.setDrawColor(237,242,247);
      doc.line(left, y + 8, pageW - right, y + 8);
      doc.setTextColor(16,24,40);
      const nameLines = doc.splitTextToSize(String(item.name), 78);
      doc.text(nameLines[0], cols[0]+2, y+5.4);
      doc.text(String(item.amountLabel || (item.grams + ' g')), cols[1]+2, y+5.4);
      doc.text(String(round(item.kcal)), cols[2]+10, y+5.4, {align:'right'});
      doc.text(String(round(item.protein)), cols[3]+10, y+5.4, {align:'right'});
      doc.text(String(round(item.carbs)), cols[4]+10, y+5.4, {align:'right'});
      doc.text(String(round(item.fat)), cols[5]+10, y+5.4, {align:'right'});
      y += 8;
    });
    y += 6;
  });
  return y;
}

function drawDayPage(doc, type){
  doc.addPage();
  const name = ($('clientName')?.value || 'Klient').trim();
  doc.setTextColor(102,112,133);
  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.text('PETRA DOBROVOLNÁ', 14, 13);
  doc.text(name, 196, 13, {align:'right'});

  doc.setTextColor(16,24,40);
  doc.setFontSize(22);
  doc.text(dayTypeLabel(type), 14, 27);
  const t = totals(type);
  const targets = getTargets(type);
  doc.setFontSize(10);
  doc.setTextColor(21,94,239);
  doc.text(`${round(t.kcal)} / ${targets.kcal} kcal`, 196, 27, {align:'right'});
  doc.setDrawColor(21,94,239);
  doc.setLineWidth(0.8);
  doc.line(14, 32, 196, 32);
  drawMacroCards(doc, type, 14, 38, 182);
  drawMealTable(doc, type, 70);
}

function drawSummaryPage(doc){
  doc.addPage();
  doc.setFont('helvetica','bold');
  doc.setFontSize(22);
  doc.setTextColor(16,24,40);
  doc.text('Souhrn jídelníčků', 14, 24);
  doc.setDrawColor(21,94,239);
  doc.setLineWidth(0.8);
  doc.line(14, 30, 196, 30);
  let y = 42;
  ['training','rest'].forEach(type => {
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.setTextColor(16,24,40);
    doc.text(dayTypeLabel(type), 14, y);
    y += 7;
    drawMacroCards(doc, type, 14, y, 182);
    y += 34;
  });
}

function equivalentAmountForReplacement(item, replacementFood){
  const sourceFood = findFoodSmart(item.name) || item || {};
  const baseGrams = Number(item.grams || 0);
  const originalKcal = Number(item.kcal || 0);
  const replacementKcalPer100 = Number(replacementFood?.kcal || 0);

  let grams = baseGrams;

  // Primárně se snažíme trefit přibližně stejné kalorie jako původní položka v jídelníčku.
  if(originalKcal > 0 && replacementKcalPer100 > 0){
    grams = originalKcal / replacementKcalPer100 * 100;
  }else{
    // Záloha: použij dominantní makro původní potraviny.
    const macros = ['protein','carbs','fat'];
    const dominant = macros
      .map(key => ({key, value: Math.abs(Number(sourceFood[key] || item[key] || 0))}))
      .sort((a,b) => b.value - a.value)[0]?.key;

    const sourcePer100 = Number(sourceFood[dominant] || 0);
    const replacementPer100 = Number(replacementFood?.[dominant] || 0);
    if(baseGrams > 0 && sourcePer100 > 0 && replacementPer100 > 0){
      grams = baseGrams * sourcePer100 / replacementPer100;
    }
  }

  if(!Number.isFinite(grams) || grams <= 0) grams = baseGrams || 100;
  grams = Math.max(1, Math.round(grams));
  const label = formatAmount(replacementFood, grams);
  const macros = calc(replacementFood, grams);
  return { grams, label, macros };
}

function getReplacementPdfRows(){
  const items = [...getReport('training'), ...getReport('rest')];
  const seen = new Set();
  const unique = [];
  items.forEach(item => {
    const key = foodKey(item.name);
    if(key && !seen.has(key)){
      seen.add(key);
      unique.push(item);
    }
  });
  return unique.slice(0, 18).map(item => {
    const candidates = getReplacementCandidates(item).slice(0, 4).map(f => {
      const eq = equivalentAmountForReplacement(item, f);
      return `${f.name} (${eq.label})`;
    });
    return { name: `${item.name} (${item.amountLabel || formatAmount(item.name, item.grams)})`, candidates };
  }).filter(r => r.candidates.length);
}

function drawReplacementsPage(doc){
  const rows = getReplacementPdfRows();
  if(!rows.length) return;
  doc.addPage();
  doc.setFont('helvetica','bold');
  doc.setFontSize(22);
  doc.setTextColor(16,24,40);
  doc.text('Náhrady potravin', 14, 24);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(102,112,133);
  doc.text('Orientační alternativy s podobným charakterem nebo makry. Dávkování vždy dolaď podle cílových maker.', 14, 32);
  let y = 44;
  rows.forEach(row => {
    if(y > 270){ doc.addPage(); y = 18; }
    doc.setFillColor(248,251,255);
    doc.setDrawColor(228,234,243);
    doc.roundedRect(14, y, 182, 18, 4, 4, 'FD');
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(16,24,40);
    doc.text(row.name, 18, y + 7);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.3);
    doc.setTextColor(71,84,103);
    doc.text(doc.splitTextToSize(row.candidates.join(' · '), 166), 18, y + 13);
    y += 23;
  });
}

function replacementRowsHtml(){
  const rows = getReplacementPdfRows();
  if(!rows.length) return '';
  return `
    <div class="pdf-html-page">
      <div class="html-page-inner">
        <h1>Náhrady potravin</h1>
        <p class="html-muted">Orientační alternativy s podobným charakterem nebo makry. Dávkování vždy dolaď podle cílových maker.</p>
        <div class="html-replacements">
          ${rows.map(row => `
            <div class="html-replacement-card">
              <strong>${xmlEsc(row.name)}</strong>
              <span>${xmlEsc(row.candidates.join(' · '))}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function summaryPdfHtml(){
  return `
    <div class="pdf-html-page">
      <div class="html-page-inner">
        <h1>Souhrn jídelníčků</h1>
        <div class="html-blue-line"></div>
        ${['training','rest'].map(type => `
          <section class="html-summary-block">
            <h2>${xmlEsc(dayTypeLabel(type))}</h2>
            <div class="pdf-macros">${macroCardsHtml(type)}</div>
          </section>`).join('')}
      </div>
    </div>`;
}

function dayPdfHtml(type){
  const t = totals(type);
  const targets = getTargets(type);
  const name = ($('clientName')?.value || 'Klient').trim();
  return `
    <div class="pdf-html-page">
      <div class="html-page-inner">
        <div class="html-topline"><strong>PETRA DOBROVOLNÁ</strong><span>${xmlEsc(name)}</span></div>
        <div class="html-day-head">
          <div><span>Jídelníček</span><h1>${xmlEsc(dayTypeLabel(type))}</h1></div>
          <b>${round(t.kcal)} / ${targets.kcal} kcal</b>
        </div>
        <div class="html-blue-line"></div>
        <div class="pdf-macros">${macroCardsHtml(type)}</div>
        ${pdfMealSectionsHtml(type)}
      </div>
    </div>`;
}

function coverPdfHtml(){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const name = ($('clientName')?.value || 'Klient').trim();
  const description = ($('clientDescription')?.value || 'Tréninkový a netréninkový jídelníček připravený Petrou Dobrovolnou.').trim();
  return `
    <div class="pdf-html-page html-cover">
      <div class="html-cover-bg html-cover-blue"></div>
      <div class="html-cover-bg html-cover-green"></div>
      <div class="html-cover-content">
        <div class="html-cover-kicker">PETRA DOBROVOLNÁ</div>
        <h1>Jídelníček<br>pro klienta</h1>
        <p>${xmlEsc(description)}</p>
        <img class="html-cover-img" src="cover-food.jpg" alt="Jídlo">
        <div class="html-cover-boxes">
          <div><small>Klient</small><strong>${xmlEsc(name)}</strong></div>
          <div><small>Datum</small><strong>${xmlEsc(date)}</strong></div>
          <div><small>Obsah</small><strong>Tréninkový + netréninkový den</strong></div>
        </div>
        <footer>Vytvořila Petra Dobrovolná</footer>
      </div>
    </div>`;
}

function buildPdfHtmlDocument(){
  return `
    <div id="pdfRenderRoot" class="pdf-render-root">
      <style>
        .pdf-render-root{position:fixed;left:-10000px;top:0;width:794px;background:#fff;font-family:Inter,Arial,sans-serif;color:#101828;}
        .pdf-html-page{width:794px;min-height:1123px;background:#fff;position:relative;overflow:hidden;box-sizing:border-box;page-break-after:always;}
        .html-page-inner{padding:54px 54px 42px 54px;box-sizing:border-box;}
        .html-cover{background:#0b1220;color:#fff;}
        .html-cover-bg{position:absolute;border-radius:999px;filter:blur(0.2px);opacity:.92;}
        .html-cover-blue{width:330px;height:330px;right:-95px;top:-90px;background:#155eef;}
        .html-cover-green{width:430px;height:430px;left:-170px;bottom:-190px;background:#12b76a;}
        .html-cover-content{position:relative;z-index:2;padding:72px 68px 52px 68px;box-sizing:border-box;height:1123px;}
        .html-cover-kicker{font-weight:900;letter-spacing:.15em;color:#d7e7ff;font-size:19px;margin-bottom:18px;}
        .html-cover h1{font-size:66px;line-height:1.05;margin:0 0 22px 0;letter-spacing:-.04em;}
        .html-cover p{font-size:19px;line-height:1.45;color:#eef6ff;width:610px;margin:0 0 28px 0;}
        .html-cover-img{display:block;width:560px;height:390px;object-fit:cover;border-radius:28px;margin:28px auto 42px auto;box-shadow:0 26px 70px rgba(0,0,0,.38);background:#fff;}
        .html-cover-boxes{display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:16px;margin-top:12px;}
        .html-cover-boxes div{background:#1e4078;border-radius:18px;padding:15px 17px;min-height:72px;box-sizing:border-box;}
        .html-cover-boxes small{display:block;text-transform:uppercase;color:#cfe1ff;font-weight:900;font-size:12px;letter-spacing:.1em;margin-bottom:9px;}
        .html-cover-boxes strong{font-size:18px;line-height:1.2;color:#fff;}
        .html-cover footer{position:absolute;right:68px;bottom:44px;color:#dbeafe;font-size:16px;}
        .html-topline{display:flex;justify-content:space-between;align-items:center;color:#667085;font-size:14px;margin-bottom:28px;}
        .html-topline strong{letter-spacing:.12em;color:#667085;}
        .html-day-head{display:flex;justify-content:space-between;align-items:end;gap:20px;}
        .html-day-head span{display:block;color:#155eef;font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:13px;margin-bottom:4px;}
        .html-day-head h1,.html-page-inner h1{font-size:42px;line-height:1.05;margin:0;color:#101828;letter-spacing:-.035em;}
        .html-day-head b{color:#155eef;font-size:20px;white-space:nowrap;}
        .html-blue-line{height:4px;background:#155eef;border-radius:999px;margin:18px 0 24px;}
        .pdf-macros{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 24px 0;}
        .pdf-macro{border:1px solid #d1ddec;background:#f8fbff;border-radius:16px;padding:13px 12px;box-sizing:border-box;min-height:84px;}
        .pdf-macro.over{border-color:#f87171;background:#fff1f2;}
        .pdf-macro span{display:block;text-transform:uppercase;letter-spacing:.08em;color:#667085;font-size:11px;font-weight:900;margin-bottom:9px;}
        .pdf-macro strong{display:block;font-size:22px;color:#101828;line-height:1.1;margin-bottom:8px;}
        .pdf-macro.over strong{color:#dc2626;}
        .pdf-macro small{display:block;color:#12b76a;font-weight:800;font-size:11px;line-height:1.2;}
        .pdf-macro.over small{color:#dc2626;}
        .pdf-meal{border:1px solid #e4e9f2;border-radius:18px;overflow:hidden;margin:0 0 18px 0;background:#fff;break-inside:avoid;}
        .pdf-meal-title{background:#101828;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:12px 15px;gap:16px;}
        .pdf-meal-title h3{margin:0;font-size:19px;color:#fff;}
        .pdf-meal-title span{font-size:12px;color:#d0d5dd;white-space:nowrap;font-weight:800;}
        .pdf-meal table{width:100%;border-collapse:collapse;font-size:14px;}
        .pdf-meal th{background:#f2f6ff;color:#344054;text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:11px;padding:9px 10px;}
        .pdf-meal td{border-top:1px solid #edf2f7;padding:10px;color:#101828;}
        .pdf-meal tbody tr:nth-child(even){background:#fbfdff;}
        .pdf-empty{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:18px;padding:22px;text-align:center;color:#667085;font-weight:800;}
        .html-summary-block{border:1px solid #e4e9f2;border-radius:20px;padding:20px;margin:0 0 28px;background:#fff;}
        .html-summary-block h2{font-size:26px;margin:0 0 16px;color:#101828;}
        .html-replacements{display:grid;gap:13px;margin-top:24px;}
        .html-replacement-card{background:#f8fbff;border:1px solid #e4eaf3;border-radius:16px;padding:13px 16px;}
        .html-replacement-card strong{display:block;font-size:16px;color:#101828;margin-bottom:7px;}
        .html-replacement-card span{display:block;font-size:13px;color:#475467;line-height:1.35;}
        .html-muted{color:#667085;font-size:16px;line-height:1.45;margin-top:12px;}
      </style>
      ${coverPdfHtml()}
      ${dayPdfHtml('training')}
      ${dayPdfHtml('rest')}
      ${summaryPdfHtml()}
      ${$('includeReplacementsPdf')?.checked ? replacementRowsHtml() : ''}
    </div>`;
}

async function waitForImages(root){
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => {
    if(img.complete) return Promise.resolve();
    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
  }));
}

async function exportPdf(){
  const jspdfLib = window.jspdf;
  if(!jspdfLib || !jspdfLib.jsPDF){
    return alert('PDF knihovna se nenačetla. Zkontroluj internetové připojení a obnov stránku.');
  }
  if(!window.html2canvas){
    return alert('Knihovna pro správnou diakritiku PDF se nenačetla. Zkontroluj internetové připojení a obnov stránku.');
  }

  const { jsPDF } = jspdfLib;
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const name = ($('clientName')?.value || 'Klient').trim();
  const fileTitle = `${safeFileName(name)}-${date}-jidelnicek.pdf`;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildPdfHtmlDocument();
  const root = wrapper.firstElementChild;
  document.body.appendChild(root);

  try{
    await waitForImages(root);
    const pages = Array.from(root.querySelectorAll('.pdf-html-page'));
    const doc = new jsPDF({orientation:'portrait', unit:'mm', format:'a4'});
    for(let i = 0; i < pages.length; i++){
      const canvas = await window.html2canvas(pages[i], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      if(i > 0) doc.addPage();
      doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }
    doc.save(fileTitle);
  }catch(error){
    console.error(error);
    alert('PDF se nepodařilo vytvořit: ' + error.message);
  }finally{
    root.remove();
  }
}

function worksheetXml(type){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const data = sortedReport(type);
  const t = totals(type);
  const targets = getTargets(type);
  const sheetName = type === 'training' ? 'Tréninkový den' : 'Netréninkový den';
  const name = ($('clientName')?.value || '').trim();
  const targetRows = [
    row(['Přehled cílů', '', '', '', '', ''], 'TargetHeader'),
    row(['Makro', 'Cíl', 'Snědeno', 'Zbývá / přesah', '', ''], 'Header'),
    row(['Kalorie', [targets.kcal, 'Number'], [round(t.kcal), 'Number'], [round(targets.kcal - t.kcal), 'Number'], '', ''], 'Goal'),
    row(['Bílkoviny', [targets.protein, 'Number'], [round(t.protein), 'Number'], [round(targets.protein - t.protein), 'Number'], '', ''], 'Goal'),
    row(['Sacharidy', [targets.carbs, 'Number'], [round(t.carbs), 'Number'], [round(targets.carbs - t.carbs), 'Number'], '', ''], 'Goal'),
    row(['Tuky', [targets.fat, 'Number'], [round(t.fat), 'Number'], [round(targets.fat - t.fat), 'Number'], '', ''], 'Goal'),
    row(['', '', '', '', '', ''])
  ].join('');

  const mealRows = mealOrder.map(meal => {
    const items = data.filter(x => x.meal === meal);
    const header = row([meal, '', '', '', '', ''], 'MealHeader');
    if(!items.length){
      return header + row(['Bez položek', '', '', '', '', ''], 'Empty');
    }
    return header + items.map((x, idx) => row([
      [x.name, 'String'],
      [x.amountLabel || (x.grams + ' g'), 'String'],
      [x.kcal, 'Number'],
      [x.protein, 'Number'],
      [x.carbs, 'Number'],
      [x.fat, 'Number']
    ], idx % 2 === 0 ? 'Body' : 'BodyAlt')).join('');
  }).join('');

  const otherItems = data.filter(x => !mealOrder.includes(x.meal));
  const otherRows = otherItems.length
    ? row(['Ostatní', '', '', '', '', ''], 'MealHeader') + otherItems.map((x, idx) => row([
      [x.name, 'String'], [x.amountLabel || (x.grams + ' g'), 'String'], [x.kcal, 'Number'], [x.protein, 'Number'], [x.carbs, 'Number'], [x.fat, 'Number']
    ], idx % 2 === 0 ? 'Body' : 'BodyAlt')).join('')
    : '';

  return `
    <Worksheet ss:Name="${xmlEsc(sheetName)}">
      <Table>
        <Column ss:Width="260"/><Column ss:Width="70"/><Column ss:Width="85"/><Column ss:Width="85"/><Column ss:Width="85"/><Column ss:Width="85"/>
        ${row([`PETRA DOBROVOLNÁ - ${sheetName}`, '', '', '', '', ''], 'Title')}
        ${row(['Datum', date, '', '', '', ''], 'Meta')}
        ${row(['Jméno', name, '', '', '', ''], 'Meta')}
        ${row(['Typ dne', sheetName, '', '', '', ''], 'Meta')}
        ${row(['', '', '', '', '', ''])}
        ${targetRows}
        ${row(['Potravina','Množství','Kcal','Bílkoviny','Sacharidy','Tuky'], 'Header')}
        ${mealRows}
        ${otherRows}
        ${row(['', '', '', '', '', ''])}
        ${row(['CELKEM', '', [round(t.kcal),'Number'], [round(t.protein),'Number'], [round(t.carbs),'Number'], [round(t.fat),'Number']], 'Total')}
        ${row(['CÍL', '', [targets.kcal,'Number'], [targets.protein,'Number'], [targets.carbs,'Number'], [targets.fat,'Number']], 'GoalStrong')}
        ${row(['ZBÝVÁ / PŘESAH', '', [round(targets.kcal - t.kcal),'Number'], [round(targets.protein - t.protein),'Number'], [round(targets.carbs - t.carbs),'Number'], [round(targets.fat - t.fat),'Number']], 'Delta')}
      </Table>
    </Worksheet>`;
}
function rowsForXlsx(type){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const data = sortedReport(type);
  const t = totals(type);
  const targets = getTargets(type);
  const sheetName = type === 'training' ? 'Tréninkový den' : 'Netréninkový den';
  const name = ($('clientName')?.value || '').trim();
  const rows = [
    [`Petra Dobrovolná - ${sheetName}`],
    ['Datum', date],
    ['Jméno', name],
    ['Typ dne', sheetName],
    [],
    ['Přehled cílů'],
    ['Makro', 'Cíl', 'Snědeno', 'Zbývá / přesah'],
    ['Kalorie', Number(targets.kcal), round(t.kcal), round(targets.kcal - t.kcal)],
    ['Bílkoviny', Number(targets.protein), round(t.protein), round(targets.protein - t.protein)],
    ['Sacharidy', Number(targets.carbs), round(t.carbs), round(targets.carbs - t.carbs)],
    ['Tuky', Number(targets.fat), round(t.fat), round(targets.fat - t.fat)],
    [],
    ['Potravina','Množství','Kcal','Bílkoviny','Sacharidy','Tuky']
  ];
  mealOrder.forEach(meal => {
    const items = data.filter(x => x.meal === meal);
    rows.push([meal]);
    if(!items.length){
      rows.push(['Bez položek']);
    }else{
      items.forEach(x => rows.push([x.name, x.amountLabel || formatAmount(x.name, x.grams), round(x.kcal), round(x.protein), round(x.carbs), round(x.fat)]));
    }
  });
  const otherItems = data.filter(x => !mealOrder.includes(x.meal));
  if(otherItems.length){
    rows.push(['Ostatní']);
    otherItems.forEach(x => rows.push([x.name, x.amountLabel || formatAmount(x.name, x.grams), round(x.kcal), round(x.protein), round(x.carbs), round(x.fat)]));
  }
  rows.push([], ['CELKEM','',round(t.kcal),round(t.protein),round(t.carbs),round(t.fat)], ['CÍL','',targets.kcal,targets.protein,targets.carbs,targets.fat], ['ZBÝVÁ / PŘESAH','',round(targets.kcal - t.kcal),round(targets.protein - t.protein),round(targets.carbs - t.carbs),round(targets.fat - t.fat)]);
  return rows;
}

function styleXlsxSheet(ws, rows){
  ws['!cols'] = [{wch:34},{wch:18},{wch:12},{wch:14},{wch:14},{wch:12}];
  ws['!rows'] = rows.map((r,i)=>({hpt: i===0 ? 26 : 20}));
  const range = XLSX.utils.decode_range(ws['!ref']);
  for(let R = range.s.r; R <= range.e.r; ++R){
    for(let C = range.s.c; C <= range.e.c; ++C){
      const addr = XLSX.utils.encode_cell({r:R,c:C});
      const cellObj = ws[addr];
      if(!cellObj) continue;
      cellObj.s = cellObj.s || {};
      cellObj.s.font = { name: 'Arial', sz: 10, color: { rgb: '101828' } };
      cellObj.s.alignment = { vertical: 'center' };
      cellObj.s.border = { bottom: { style: 'thin', color: { rgb: 'E7EEF8' } } };
      if(R === 0){
        cellObj.s.font = { name: 'Arial', bold: true, sz: 16, color: { rgb: 'FFFFFF' } };
        cellObj.s.fill = { fgColor: { rgb: '155EEF' } };
      }
      if(['Přehled cílů','Snídaně','Svačina','Oběd','Odpolední svačina','Večeře','Druhá večeře','Ostatní'].includes(rows[R]?.[0])){
        cellObj.s.font = { name: 'Arial', bold: true, sz: 12, color: { rgb: 'FFFFFF' } };
        cellObj.s.fill = { fgColor: { rgb: rows[R][0] === 'Přehled cílů' ? '155EEF' : '344054' } };
      }
      if(['Makro','Potravina'].includes(rows[R]?.[0])){
        cellObj.s.font = { name: 'Arial', bold: true, sz: 10, color: { rgb: 'FFFFFF' } };
        cellObj.s.fill = { fgColor: { rgb: '101828' } };
      }
      if(['CELKEM'].includes(rows[R]?.[0])){
        cellObj.s.font = { name: 'Arial', bold: true, color: { rgb: 'FFFFFF' } };
        cellObj.s.fill = { fgColor: { rgb: '12B76A' } };
      }
      if(['CÍL','ZBÝVÁ / PŘESAH'].includes(rows[R]?.[0])){
        cellObj.s.font = { name: 'Arial', bold: true, color: { rgb: '101828' } };
        cellObj.s.fill = { fgColor: { rgb: rows[R][0] === 'CÍL' ? 'D1FADF' : 'FEF0C7' } };
      }
    }
  }
}

function exportExcel(){
  if(!window.XLSX){
    alert('XLSX knihovna se nenačetla. Zkontroluj internetové připojení a obnov stránku.');
    return;
  }
  const wb = XLSX.utils.book_new();
  ['training','rest'].forEach(type => {
    const rows = rowsForXlsx(type);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    styleXlsxSheet(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, type === 'training' ? 'Tréninkový den' : 'Netréninkový den');
  });
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `${safeFileName(($('clientName')?.value || 'jidelnicek'))}-${date}.xlsx`, { bookType: 'xlsx', cellStyles: true });
}

function clearDay(){
  if(confirm(`Opravdu vymazat jídelníček pro ${dayTypeLabel()}?`)){
    reports[currentDayType] = [];
    save(); render();
  }
}

$('reportDate').value = new Date().toISOString().slice(0,10);
if($('clientName')) $('clientName').value = clientName;
if($('clientDescription')) $('clientDescription').value = clientDescription;
$('dayType').value = currentDayType;
applyTargetsForDayType();
$('addFoodBtn').onclick = addFood;
if($('favoriteFoodBtn')) $('favoriteFoodBtn').onclick = toggleFavoriteFood;
$('dayType').onchange = changeDayType;
$('reportDate').addEventListener('change', render);
$('saveTargetsBtn').onclick = saveTargetsForDayType;
$('foodSearch').addEventListener('input', (event) => {
  refreshFoodSuggestions(event.target.value);
  updateFoodHint();
});
$('foodSearch').addEventListener('keydown', (event) => {
  if(event.key === 'Enter'){
    event.preventDefault();
    addFood();
  }
});
if($('copyBtn')) $('copyBtn').onclick = copyReport;
if($('csvBtn')) $('csvBtn').onclick = exportCsv;
$('excelBtn').onclick = exportExcel;
if($('pdfBtn')) $('pdfBtn').onclick = exportPdf;
if($('generateMealPlanBtn')) $('generateMealPlanBtn').onclick = () => generateMealPlan(false);
if($('appendGeneratedMealPlanBtn')) $('appendGeneratedMealPlanBtn').onclick = () => generateMealPlan(true);
$('clearBtn').onclick = clearDay;
$('foodImport').addEventListener('change', importFoods);
$('exportFoodsBtn').onclick = exportFoods;
$('resetFoodsBtn').onclick = resetFoods;
if($('saveCustomFoodBtn')) $('saveCustomFoodBtn').onclick = saveCustomFood;
if($('clearCustomFoodBtn')) $('clearCustomFoodBtn').onclick = clearCustomFoodForm;
if($('deleteCustomFoodBtn')) $('deleteCustomFoodBtn').onclick = deleteCustomFood;
$('templateSelect').addEventListener('change', updateTemplatePreview);
$('loadTemplateBtn').onclick = () => applyTemplate(false);
$('appendTemplateBtn').onclick = () => applyTemplate(true);
$('saveTemplateBtn').onclick = saveCurrentTemplate;
$('createTemplateBtn').onclick = createNewTemplate;
if($('deleteTemplateBtn')) $('deleteTemplateBtn').onclick = deleteCurrentTemplate;
$('exportTemplatesBtn').onclick = exportTemplates;
$('resetTemplatesBtn').onclick = resetTemplates;
if($('clientName')) $('clientName').addEventListener('input', (event) => { clientName = event.target.value; localStorage.setItem('nutritionClientName', clientName); render(); });
if($('clientDescription')) $('clientDescription').addEventListener('input', (event) => { clientDescription = event.target.value; localStorage.setItem('nutritionClientDescription', clientDescription); });
['targetKcal','targetProtein','targetCarbs','targetFat'].forEach(id => $(id).addEventListener('input', () => { render(); updateDayTypeHint('Neuložená změna.'); }));
loadFoods();
loadTemplates();
