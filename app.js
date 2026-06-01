let foods = [];
let defaultFoods = [];
let report = JSON.parse(localStorage.getItem('nutritionReport') || '[]');

const $ = (id) => document.getElementById(id);
const round = (n) => Math.round(n * 10) / 10;

async function loadFoods(){
  const res = await fetch('foods.json');
  defaultFoods = await res.json();
  const savedFoods = localStorage.getItem('nutritionFoods');
  foods = savedFoods ? JSON.parse(savedFoods) : defaultFoods;
  refreshFoodSelect();
  updateImportStatus('Databáze potravin načtena.');
  render();
}

function refreshFoodSelect(){
  $('foodSelect').innerHTML = foods.map((f,i)=>`<option value="${i}">${f.name}</option>`).join('');
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

function save(){ localStorage.setItem('nutritionReport', JSON.stringify(report)); }

function addFood(){
  const food = foods[Number($('foodSelect').value)];
  const grams = Number($('gramsInput').value);
  if(!food || grams <= 0) return alert('Zadej platnou potravinu a gramy.');
  report.push({ meal: $('mealType').value, name: food.name, grams, ...calc(food, grams) });
  save(); render();
}

function removeItem(index){ report.splice(index,1); save(); render(); }

function totals(){
  return report.reduce((a,x)=>({kcal:a.kcal+x.kcal, protein:a.protein+x.protein, carbs:a.carbs+x.carbs, fat:a.fat+x.fat}), {kcal:0,protein:0,carbs:0,fat:0});
}

function metric(label, value, target, unit=''){
  const pct = target ? Math.min(100, Math.round(value / target * 100)) : 0;
  return `<div class="metric"><span>${label}</span><strong>${round(value)}${unit}</strong><span>Cíl: ${target}${unit} · ${pct}%</span><div class="bar"><div class="fill" style="width:${pct}%"></div></div></div>`;
}

function render(){
  const t = totals();
  $('summary').innerHTML = [
    metric('Kalorie', t.kcal, Number($('targetKcal').value), ' kcal'),
    metric('Bílkoviny', t.protein, Number($('targetProtein').value), ' g'),
    metric('Sacharidy', t.carbs, Number($('targetCarbs').value), ' g'),
    metric('Tuky', t.fat, Number($('targetFat').value), ' g')
  ].join('');

  $('reportBody').innerHTML = report.map((x,i)=>`<tr><td>${x.meal}</td><td>${x.name}</td><td>${x.grams}</td><td>${x.kcal}</td><td>${x.protein}</td><td>${x.carbs}</td><td>${x.fat}</td><td><button onclick="removeItem(${i})">X</button></td></tr>`).join('');
  $('textReport').value = buildTextReport(t);
}

function buildTextReport(t){
  const date = $('reportDate').value || new Date().toISOString().slice(0,10);
  const lines = [`Denní report ${date}`, '', ...report.map(x => `${x.meal}: ${x.name} ${x.grams} g | ${x.kcal} kcal | B ${x.protein} g | S ${x.carbs} g | T ${x.fat} g`), '', `CELKEM: ${round(t.kcal)} kcal | B ${round(t.protein)} g | S ${round(t.carbs)} g | T ${round(t.fat)} g`];
  return lines.join('\n');
}

function copyReport(){ navigator.clipboard.writeText($('textReport').value); alert('Report zkopírován.'); }

function exportCsv(){
  const rows = [['Jídlo','Potravina','Gramy','Kcal','Bílkoviny','Sacharidy','Tuky'], ...report.map(x=>[x.meal,x.name,x.grams,x.kcal,x.protein,x.carbs,x.fat])];
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nutrition-report.csv'; a.click();
}

function clearDay(){ if(confirm('Opravdu vymazat dnešní report?')){ report=[]; save(); render(); } }

$('reportDate').value = new Date().toISOString().slice(0,10);
$('addFoodBtn').onclick = addFood;
$('copyBtn').onclick = copyReport;
$('csvBtn').onclick = exportCsv;
$('clearBtn').onclick = clearDay;
$('foodImport').addEventListener('change', importFoods);
$('exportFoodsBtn').onclick = exportFoods;
$('resetFoodsBtn').onclick = resetFoods;
['targetKcal','targetProtein','targetCarbs','targetFat'].forEach(id => $(id).addEventListener('input', render));
loadFoods();
