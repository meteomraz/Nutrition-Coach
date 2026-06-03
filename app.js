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
  if(food) return { ...item, grams, ...calc(food, grams) };
  const ratio = item.grams ? grams / item.grams : 1;
  return {
    ...item,
    grams,
    kcal: round(item.kcal * ratio),
    protein: round(item.protein * ratio),
    carbs: round(item.carbs * ratio),
    fat: round(item.fat * ratio)
  };
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
    report[index] = { ...report[index], ...calc(food, Number(report[index].grams)) };
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
  $('unitSelect').innerHTML = `<option value="g">g</option>` + (pieceWeight > 0 ? `<option value="piece">${pieceName}</option>` : '');
  $('unitSelect').value = pieceWeight > 0 && current === 'piece' ? 'piece' : 'g';
  if($('unitHint')){
    $('unitHint').textContent = pieceWeight > 0
      ? `Lze zadat gramy nebo ${pieceName}. 1 ${pieceName} ≈ ${pieceWeight} g.`
      : 'Tato potravina se počítá v gramech.';
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

function findFoodSmart(names){
  const candidates = Array.isArray(names) ? names : [names];
  for(const name of candidates){
    const exact = foods.find(f => normalizeText(f.name) === normalizeText(name));
    if(exact) return exact;
  }
  for(const name of candidates){
    const starts = foods.find(f => normalizeText(f.name).startsWith(normalizeText(name)));
    if(starts) return starts;
  }
  for(const name of candidates){
    const contains = foods.find(f => normalizeText(f.name).includes(normalizeText(name)));
    if(contains) return contains;
  }
  return null;
}

function generatedFoodItem(meal, names, grams, role = '', min = 0, max = 999){
  const food = findFoodSmart(names);
  if(!food) return null;
  const safeGrams = Math.max(min || 0, Math.min(max || 999, round(Number(grams) || 0)));
  return { meal, name: food.name, grams: safeGrams, role, min, max, amount: safeGrams, unitMode: 'g', amountLabel: `${safeGrams} g`, ...calc(food, safeGrams) };
}

function generatorBlueprint(){
  const count = Number($('generatorMealsCount')?.value || 6);
  const style = $('generatorStyle')?.value || 'fitness';
  const carbSource = $('generatorCarbSource')?.value || 'rice';
  const proteinSource = $('generatorProteinSource')?.value || 'chicken';
  const proteinMain = proteinSource === 'turkey' ? 'Krůtí mleté 2% Lidl' : proteinSource === 'mixed' ? ['Kuřecí prsa syrová','Krůtí mleté 2% Lidl'] : 'Kuřecí prsa syrová';
  const lunchCarb = carbSource === 'potatoes' ? 'Brambory vařené' : 'Rýže basmati suchá';
  const dinnerCarb = carbSource === 'rice' ? 'Rýže basmati suchá' : 'Batáty syrové';
  const fatOil = style === 'diet' ? 3 : style === 'bulk' ? 12 : 8;

  const items = [
    generatedFoodItem('Snídaně', ['Ovesné vločky','Ovesné vločky jemné'], style === 'bulk' ? 90 : 70, 'carb', 30, 160),
    generatedFoodItem('Snídaně', ['Whey protein','Syrovátkový protein whey 80%'], 30, 'protein', 15, 60),
    generatedFoodItem('Snídaně', 'Vejce celé', style === 'diet' ? 50 : 100, 'fat', 0, 200),
    generatedFoodItem('Snídaně', 'Med', style === 'bulk' ? 20 : 10, 'carb', 0, 60),

    generatedFoodItem('Svačina', ['Skyr','Skyr bílý','Tvaroh nízkotučný'], 250, 'protein', 100, 500),
    generatedFoodItem('Svačina', ['Banán','Banán čerstvý'], style === 'diet' ? 80 : 120, 'carb', 0, 250),

    generatedFoodItem('Oběd', proteinMain, style === 'bulk' ? 230 : 200, 'protein', 100, 350),
    generatedFoodItem('Oběd', lunchCarb, style === 'bulk' ? 110 : 80, 'carb', 30, 180),
    generatedFoodItem('Oběd', ['Zelenina mix','Zelenina mix mražená'], 200, 'veg', 100, 400),
    generatedFoodItem('Oběd', 'Olivový olej', fatOil, 'fat', 0, 30),

    generatedFoodItem('Odpolední svačina', ['Rýžová kaše instantní natural','Rýžová kaše vanilková'], style === 'bulk' ? 80 : 55, 'carb', 20, 140),
    generatedFoodItem('Odpolední svačina', ['Whey protein','Syrovátkový protein whey 80%'], 30, 'protein', 15, 60),

    generatedFoodItem('Večeře', proteinSource === 'mixed' ? 'Losos syrový' : proteinMain, style === 'diet' ? 180 : 220, 'protein', 100, 350),
    generatedFoodItem('Večeře', dinnerCarb, style === 'bulk' ? 300 : 220, 'carb', 80, 500),
    generatedFoodItem('Večeře', ['Chřest','Brokolice','Zelenina mix'], 150, 'veg', 80, 350),
    generatedFoodItem('Večeře', 'Olivový olej', style === 'diet' ? 0 : 6, 'fat', 0, 25)
  ].filter(Boolean);

  if(count >= 6){
    items.push(
      generatedFoodItem('Druhá večeře', ['Tvaroh nízkotučný','Tvaroh polotučný','Skyr'], 250, 'protein', 100, 500),
      generatedFoodItem('Druhá večeře', style === 'bulk' ? 'Hořká čokoláda 85 %' : 'Mandle', style === 'bulk' ? 20 : 15, 'fat', 0, 50)
    );
  }else{
    items.push(generatedFoodItem('Svačina', ['Rýžové chlebíčky natural','Rýžové chlebíčky'], style === 'bulk' ? 40 : 20, 'carb', 0, 80));
  }

  return items.filter(Boolean);
}

function recalcGenerated(items){
  return items.map(item => {
    const food = findFoodSmart(item.name);
    return food ? { ...item, amount: item.grams, amountLabel: `${round(item.grams)} g`, ...calc(food, item.grams) } : item;
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
  const amountLabel = unitMode === 'piece' && pieceWeight > 0 ? `${amount} ${pieceName} / ${grams} g` : `${grams} g`;
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

function renderEditableRow(x){
  return `<tr class="meal-item">
    <td><select class="table-select" onchange="updateItemMeal(${x.originalIndex}, this.value)">${mealOptionsHtml(x.meal)}</select></td>
    <td><input class="food-edit" type="text" list="foodSuggestions" value="${xmlEsc(x.name)}" onchange="updateItemFood(${x.originalIndex}, this.value)"></td>
    <td><input class="grams-edit" type="number" min="1" value="${x.grams}" onchange="updateItemGrams(${x.originalIndex}, this.value)">${x.amountLabel && x.amountLabel !== `${x.grams} g` ? `<span class="amount-label">${xmlEsc(x.amountLabel)}</span>` : ''}</td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.kcal}" onchange="updateItemMacro(${x.originalIndex}, 'kcal', this.value)"></td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.protein}" onchange="updateItemMacro(${x.originalIndex}, 'protein', this.value)"></td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.carbs}" onchange="updateItemMacro(${x.originalIndex}, 'carbs', this.value)"></td>
    <td><input class="macro-edit" type="number" step="0.1" value="${x.fat}" onchange="updateItemMacro(${x.originalIndex}, 'fat', this.value)"></td>
    <td><button onclick="removeItem(${x.originalIndex})">X</button></td>
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

function exportPdf(){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const name = ($('clientName')?.value || 'Klient').trim();
  const fileTitle = `${safeFileName(name)}-${date}-jidelnicek`;
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>${xmlEsc(fileTitle)}</title>
  <style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#101828;margin:0;background:#fff;line-height:1.35}
    .pdf-cover{background:linear-gradient(135deg,#0f172a 0%,#155eef 55%,#12b76a 120%);color:white;border-radius:22px;padding:24px 26px;margin-bottom:18px;box-shadow:0 10px 28px rgba(16,24,40,.16)}
    .pdf-brand{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
    .pdf-logo{font-size:13px;text-transform:uppercase;letter-spacing:.14em;font-weight:800;color:#d7e7ff}
    .pdf-cover h1{margin:10px 0 8px;font-size:32px;line-height:1.05}
    .pdf-cover p{margin:4px 0;color:#eaf0ff;font-size:14px}
    .pdf-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
    .pdf-meta div{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);border-radius:14px;padding:10px 12px}
    .pdf-meta span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#cfe1ff;font-weight:800}.pdf-meta strong{display:block;margin-top:4px;font-size:15px}
    .pdf-day{margin-top:16px}.page-break{break-before:page;page-break-before:always}
    .pdf-day-head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #155eef;padding-bottom:10px;margin-bottom:12px}
    .pdf-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:#667085;font-weight:900}.pdf-day h2{margin:2px 0 0;font-size:25px;color:#101828}.pdf-total-pill{background:#eef4ff;color:#155eef;border:1px solid #c7d7fe;border-radius:999px;padding:9px 14px;font-weight:900}
    .pdf-macros{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0 16px}.pdf-macro{border:1px solid #d9e2ef;border-radius:15px;padding:11px 12px;background:#f8fbff}.pdf-macro span{display:block;color:#667085;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.pdf-macro strong{display:block;font-size:19px;margin:5px 0;color:#101828}.pdf-macro small{font-weight:800;color:#12b76a;font-size:11px}.pdf-macro.over{background:#fff5f5;border-color:#fca5a5}.pdf-macro.over strong,.pdf-macro.over small{color:#dc2626}
    .pdf-meal{break-inside:avoid;margin:13px 0 16px;border:1px solid #e4eaf3;border-radius:16px;overflow:hidden;background:#fff}.pdf-meal-title{display:flex;justify-content:space-between;align-items:center;background:#101828;color:white;padding:10px 13px}.pdf-meal-title h3{margin:0;font-size:16px}.pdf-meal-title span{font-size:11px;color:#d0d5dd;font-weight:800;text-align:right}
    table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #edf2f7;padding:8px 9px;text-align:left;font-size:12px}th{background:#f2f6ff;color:#344054;text-transform:uppercase;font-size:10px;letter-spacing:.06em}td:nth-child(n+3),th:nth-child(n+3){text-align:right}tr:nth-child(even) td{background:#fbfdff}tr:last-child td{border-bottom:0}.pdf-empty{border:1px dashed #cbd5e1;background:#f8fafc;color:#667085;border-radius:14px;padding:18px;text-align:center;font-weight:700}.footer{margin-top:18px;color:#667085;font-size:10px;text-align:center;border-top:1px solid #e4eaf3;padding-top:10px}
    @media print{button{display:none}.pdf-cover{box-shadow:none}}
  </style></head><body>
    <header class="pdf-cover">
      <div class="pdf-brand"><div><div class="pdf-logo">Nutrition Coach</div><h1>Jídelníček pro klienta</h1><p>Tréninkový i netréninkový den v jednom PDF.</p></div></div>
      <div class="pdf-meta"><div><span>Klient</span><strong>${xmlEsc(name)}</strong></div><div><span>Datum</span><strong>${xmlEsc(date)}</strong></div><div><span>Export</span><strong>PDF plán</strong></div></div>
    </header>
    ${pdfDayBlock('training')}
    ${pdfDayBlock('rest')}
    <div class="footer">Vygenerováno z aplikace Nutrition Coach · ${xmlEsc(fileTitle)}</div>
    <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
  </body></html>`;
  const printWindow = window.open('', '_blank');
  if(!printWindow) return alert('Prohlížeč zablokoval otevření PDF okna. Povol vyskakovací okna pro tuto stránku.');
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
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
        ${row([`NUTRITION COACH - ${sheetName}`, '', '', '', '', ''], 'Title')}
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
function exportExcel(){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const workbook = `<?xml version="1.0"?>
  <?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:html="http://www.w3.org/TR/REC-html40">
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7EEF8"/></Borders></Style>
      <Style ss:ID="Title"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="18" ss:Color="#FFFFFF"/><Interior ss:Color="#155EEF" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
      <Style ss:ID="Meta"><Font ss:Bold="1" ss:Color="#344054"/><Interior ss:Color="#EEF4FF" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#101828" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
      <Style ss:ID="TargetHeader"><Font ss:Bold="1" ss:Size="12" ss:Color="#155EEF"/><Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/></Style>
      <Style ss:ID="MealHeader"><Font ss:Bold="1" ss:Size="12" ss:Color="#FFFFFF"/><Interior ss:Color="#344054" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Body"><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
      <Style ss:ID="BodyAlt"><Interior ss:Color="#F8FBFF" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Empty"><Font ss:Italic="1" ss:Color="#667085"/><Interior ss:Color="#F2F4F7" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Total"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#12B76A" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Goal"><Font ss:Bold="1"/><Interior ss:Color="#D1FADF" ss:Pattern="Solid"/></Style>
      <Style ss:ID="GoalStrong"><Font ss:Bold="1" ss:Color="#065F46"/><Interior ss:Color="#A7F3D0" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Delta"><Font ss:Bold="1"/><Interior ss:Color="#FEF0C7" ss:Pattern="Solid"/></Style>
    </Styles>
    ${worksheetXml('training')}
    ${worksheetXml('rest')}
  </Workbook>`;

  const blob = new Blob(['\ufeff', workbook], {type:'application/vnd.ms-excel;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(($('clientName')?.value || 'jidelnicek'))}-${date}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function clearDay(){
  if(confirm(`Opravdu vymazat jídelníček pro ${dayTypeLabel()}?`)){
    reports[currentDayType] = [];
    save(); render();
  }
}

$('reportDate').value = new Date().toISOString().slice(0,10);
if($('clientName')) $('clientName').value = clientName;
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
$('copyBtn').onclick = copyReport;
$('csvBtn').onclick = exportCsv;
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
['targetKcal','targetProtein','targetCarbs','targetFat'].forEach(id => $(id).addEventListener('input', () => { render(); updateDayTypeHint('Neuložená změna.'); }));
loadFoods();
loadTemplates();
