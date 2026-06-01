let foods = [];
let defaultFoods = [];

const legacyReport = localStorage.getItem('nutritionReport');
let reports = JSON.parse(localStorage.getItem('nutritionReportsByDayType') || 'null') || {
  training: legacyReport ? JSON.parse(legacyReport) : [],
  rest: []
};
let currentDayType = localStorage.getItem('nutritionDayType') || 'training';
let targetPresets = JSON.parse(localStorage.getItem('nutritionTargetPresets') || JSON.stringify({
  training: { kcal: 3000, protein: 220, carbs: 350, fat: 70 },
  rest: { kcal: 2600, protein: 220, carbs: 220, fat: 85 }
}));

const $ = (id) => document.getElementById(id);
const round = (n) => Math.round(n * 10) / 10;
const mealOrder = ['Snídaně','Svačina','Oběd','Před tréninkem','Po tréninku','Večeře'];

async function loadFoods(){
  const res = await fetch('foods.json');
  defaultFoods = await res.json();
  const savedFoods = localStorage.getItem('nutritionFoods');
  foods = savedFoods ? JSON.parse(savedFoods) : defaultFoods;
  refreshFoodSelect();
  updateImportStatus('Databáze potravin načtena.');
  render();
}

function normalizeText(value){
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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
    .slice(0, 50);

  $('foodSuggestions').innerHTML = filtered
    .map(f => `<option value="${f.name}">${f.kcal} kcal | B ${f.protein} | S ${f.carbs} | T ${f.fat}</option>`)
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

function updateFoodHint(){
  if(!$('foodHint')) return;
  const food = findFoodBySearch();
  $('foodHint').textContent = food
    ? `Vybráno: ${food.name} | ${food.kcal} kcal, B ${food.protein} g, S ${food.carbs} g, T ${food.fat} g / 100 g`
    : 'Začni psát název potraviny. Nabízí se položky začínající na zadaná písmena.';
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
    foods = imported;
    localStorage.setItem('nutritionFoods', JSON.stringify(foods));
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

function resetFoods(){
  if(!confirm('Vrátit původní databázi z foods.json? Importovaná databáze v tomto prohlížeči se smaže.')) return;
  localStorage.removeItem('nutritionFoods');
  foods = defaultFoods;
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

function addFood(){
  const food = findFoodBySearch();
  const grams = Number($('gramsInput').value);
  if(!food || grams <= 0) return alert('Zadej platnou potravinu a gramy.');
  getReport().push({ meal: $('mealType').value, name: food.name, grams, ...calc(food, grams) });
  $('foodSearch').value = '';
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
  const rawPct = target ? Math.round(value / target * 100) : 0;
  const pct = Math.min(100, rawPct);
  const exceeded = target && value > target;
  const diff = target ? round(target - value) : 0;
  const status = exceeded ? `Přesah: ${round(value - target)}${unit}` : `Zbývá: ${diff}${unit}`;
  return `<div class="metric ${exceeded ? 'over-limit' : ''}">
    <span>${label}</span>
    <strong>${round(value)}${unit}</strong>
    <span>Cíl: ${target}${unit} · ${rawPct}%</span>
    <em>${status}</em>
    <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
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
    const rows = items.map((x)=>`<tr class="meal-item"><td>${x.meal}</td><td>${x.name}</td><td>${x.grams}</td><td>${x.kcal}</td><td>${x.protein}</td><td>${x.carbs}</td><td>${x.fat}</td><td><button onclick="removeItem(${x.originalIndex})">X</button></td></tr>`).join('');
    return header + rows;
  }).join('');

  const otherItems = data.filter(x => !mealOrder.includes(x.meal));
  const otherRows = otherItems.length ? (() => {
    const mt = mealTotals(otherItems);
    const header = `<tr class="meal-divider"><td colspan="8"><div class="meal-title"><strong>Ostatní</strong><span>${round(mt.kcal)} kcal · B ${round(mt.protein)} g · S ${round(mt.carbs)} g · T ${round(mt.fat)} g</span></div></td></tr>`;
    const rows = otherItems.map((x)=>`<tr class="meal-item"><td>${x.meal}</td><td>${x.name}</td><td>${x.grams}</td><td>${x.kcal}</td><td>${x.protein}</td><td>${x.carbs}</td><td>${x.fat}</td><td><button onclick="removeItem(${x.originalIndex})">X</button></td></tr>`).join('');
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
  const lines = [`Denní report ${date}`, `Typ dne: ${dayTypeLabel()}`, '', ...sortedReport().map(x => `${x.meal}: ${x.name} ${x.grams} g | ${x.kcal} kcal | B ${x.protein} g | S ${x.carbs} g | T ${x.fat} g`), '', `CELKEM: ${round(t.kcal)} kcal | B ${round(t.protein)} g | S ${round(t.carbs)} g | T ${round(t.fat)} g`];
  return lines.join('\n');
}

function copyReport(){ navigator.clipboard.writeText($('textReport').value); alert('Report zkopírován.'); }

function exportCsv(){
  const rows = [['Typ dne', dayTypeLabel()], [], ['Jídlo','Potravina','Gramy','Kcal','Bílkoviny','Sacharidy','Tuky'], ...sortedReport().map(x=>[x.meal,x.name,x.grams,x.kcal,x.protein,x.carbs,x.fat])];
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nutrition-report-${currentDayType}.csv`; a.click();
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

function worksheetXml(type){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const data = sortedReport(type);
  const t = totals(type);
  const targets = getTargets(type);
  const sheetName = type === 'training' ? 'Tréninkový den' : 'Netréninkový den';
  const targetRows = [
    row(['Přehled cílů', '', '', '', '', '', ''], 'TargetHeader'),
    row(['Makro', 'Cíl', 'Snědeno', 'Zbývá / přesah', '', '', ''], 'Header'),
    row(['Kalorie', [targets.kcal, 'Number'], [round(t.kcal), 'Number'], [round(targets.kcal - t.kcal), 'Number'], '', '', ''], 'Goal'),
    row(['Bílkoviny', [targets.protein, 'Number'], [round(t.protein), 'Number'], [round(targets.protein - t.protein), 'Number'], '', '', ''], 'Goal'),
    row(['Sacharidy', [targets.carbs, 'Number'], [round(t.carbs), 'Number'], [round(targets.carbs - t.carbs), 'Number'], '', '', ''], 'Goal'),
    row(['Tuky', [targets.fat, 'Number'], [round(t.fat), 'Number'], [round(targets.fat - t.fat), 'Number'], '', '', ''], 'Goal'),
    row(['', '', '', '', '', '', ''])
  ].join('');

  const mealRows = mealOrder.map(meal => {
    const items = data.filter(x => x.meal === meal);
    const header = row([meal, '', '', '', '', '', ''], 'MealHeader');
    if(!items.length){
      return header + row(['', 'Bez položek', '', '', '', '', ''], 'Empty');
    }
    return header + items.map((x, idx) => row([
      [x.meal, 'String'],
      [x.name, 'String'],
      [x.grams, 'Number'],
      [x.kcal, 'Number'],
      [x.protein, 'Number'],
      [x.carbs, 'Number'],
      [x.fat, 'Number']
    ], idx % 2 === 0 ? 'Body' : 'BodyAlt')).join('');
  }).join('');

  const otherItems = data.filter(x => !mealOrder.includes(x.meal));
  const otherRows = otherItems.length
    ? row(['Ostatní', '', '', '', '', '', ''], 'MealHeader') + otherItems.map((x, idx) => row([
      [x.meal, 'String'], [x.name, 'String'], [x.grams, 'Number'], [x.kcal, 'Number'], [x.protein, 'Number'], [x.carbs, 'Number'], [x.fat, 'Number']
    ], idx % 2 === 0 ? 'Body' : 'BodyAlt')).join('')
    : '';

  return `
    <Worksheet ss:Name="${xmlEsc(sheetName)}">
      <Table>
        <Column ss:Width="120"/><Column ss:Width="240"/><Column ss:Width="70"/><Column ss:Width="85"/><Column ss:Width="85"/><Column ss:Width="85"/><Column ss:Width="85"/>
        ${row([`NUTRITION COACH - ${sheetName}`, '', '', '', '', '', ''], 'Title')}
        ${row(['Datum', date, '', '', '', '', ''], 'Meta')}
        ${row(['Typ dne', sheetName, '', '', '', '', ''], 'Meta')}
        ${row(['', '', '', '', '', '', ''])}
        ${targetRows}
        ${row(['Jídlo','Potravina','Gramy','Kcal','Bílkoviny','Sacharidy','Tuky'], 'Header')}
        ${mealRows}
        ${otherRows}
        ${row(['', '', '', '', '', '', ''])}
        ${row(['CELKEM','', '', [round(t.kcal),'Number'], [round(t.protein),'Number'], [round(t.carbs),'Number'], [round(t.fat),'Number']], 'Total')}
        ${row(['CÍL','', '', [targets.kcal,'Number'], [targets.protein,'Number'], [targets.carbs,'Number'], [targets.fat,'Number']], 'GoalStrong')}
        ${row(['ZBÝVÁ / PŘESAH','', '', [round(targets.kcal - t.kcal),'Number'], [round(targets.protein - t.protein),'Number'], [round(targets.carbs - t.carbs),'Number'], [round(targets.fat - t.fat),'Number']], 'Delta')}
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
  a.download = `jidelnicek-treninkovy-netreninkovy-${date}.xls`;
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
$('dayType').value = currentDayType;
applyTargetsForDayType();
$('addFoodBtn').onclick = addFood;
$('dayType').onchange = changeDayType;
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
$('clearBtn').onclick = clearDay;
$('foodImport').addEventListener('change', importFoods);
$('exportFoodsBtn').onclick = exportFoods;
$('resetFoodsBtn').onclick = resetFoods;
['targetKcal','targetProtein','targetCarbs','targetFat'].forEach(id => $(id).addEventListener('input', () => { render(); updateDayTypeHint('Neuložená změna.'); }));
loadFoods();
