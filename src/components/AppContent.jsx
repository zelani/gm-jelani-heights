import { useState, useMemo, useRef, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Home, Plus, Trash2, Edit2, Share2, Download, Settings, Upload, CreditCard, ExternalLink, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, BarChart, Bar } from "recharts";



const FLATS = [101,102,103,104,201,202,203,204,301,302,303,304,401,402,403,404,501,502,503,504,601,602];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS = ["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#6366f1"];
const YEARS = Array.from({length:15}, (_,i) => 2026+i);
const TODAY = new Date();
const START_YEAR = 2026;

const TASK_STATUSES = ["Not Started","In Progress","Completed","Blocked","Deferred"];
const STATUS_STYLE = {
  "Not Started":  { bg:"bg-gray-100",   text:"text-gray-600",   border:"border-gray-300",  icon:"⚪" },
  "In Progress":  { bg:"bg-blue-100",   text:"text-blue-700",   border:"border-blue-300",  icon:"🔵" },
  "Completed":    { bg:"bg-green-100",  text:"text-green-700",  border:"border-green-300", icon:"✅" },
  "Blocked":      { bg:"bg-red-100",    text:"text-red-700",    border:"border-red-300",   icon:"🔴" },
  "Deferred":     { bg:"bg-yellow-100", text:"text-yellow-700", border:"border-yellow-300",icon:"⏸️" },
};
const PRIORITY_STYLE = { "High":"text-red-600 font-bold", "Medium":"text-yellow-600 font-semibold", "Low":"text-green-600" };
const INCIDENT_SEVERITIES = ["Low","Medium","High","Critical"];
const SEV_COLORS = {"Low":"bg-green-100 text-green-700 border-green-300","Medium":"bg-yellow-100 text-yellow-700 border-yellow-300","High":"bg-orange-100 text-orange-700 border-orange-300","Critical":"bg-red-100 text-red-700 border-red-300"};
const PAYMENT_METHODS = ["Cash","UPI / GPay","NEFT / IMPS","Cheque","Bank Transfer","Other"];
const DEFAULT_CATEGORIES = {
  "Salary": ["Watchman Salary"],
  "Utility – Electricity": ["EB Motor","EB Sump Motor","EB Lift"],
  "Repair & Maintenance": ["Motor Repair","Lift Repair"],
  "Water System Maintenance": ["Bore / Pump Repair"],
  "Contracted Services (AMC)": ["Lift AMC / Annual Service Charges"],
  "Operational Expenses": ["Cleaning Charges / Sweeper Payment"],
  "Administrative & Misc": ["Stationery / Bank Charges / Miscellaneous"],
};
const CSV_HEADERS = ["flat_number","occupied_by","owner_name","owner_phone","owner_alt_name","owner_alt_phone","owner_alt_relation","owner_email","owner_staying_since","owner_adults","owner_kids","tenant_name","tenant_phone","tenant_email","tenant_move_in_date","tenant_permanent_address","tenant_adults","tenant_children","tenant_id_type","tenant_id_number","tenant_emergency_contact","tenant_emergency_relation"];
const CSV_SAMPLES = [
  [101,"Owner","Rajesh Kumar","9876543210","Priya Kumar","9876543211","Spouse","rajesh@email.com","15/01/2026",2,1,"","","","","",0,0,"","","",""],
  [102,"Tenant","Suresh Sharma","9876543220","","","","suresh@email.com","",0,0,"Arun Verma","9876543230","arun@email.com","01/06/2026","12 MG Road",2,1,"Aadhaar","1234-5678-9012","Vikram","9876543231"],
];

function emptyTenant(){return{name:"",phone:"",email:"",moveInDate:new Date().toISOString().split("T")[0],permanentAddress:"",adults:1,children:0,emergencyContact:"",emergencyRelation:"",idType:"",idNumber:""}}
function parseDate(str){if(!str) return "";str=str.trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(str)){const p=str.split("/");return p[2]+"-"+p[1]+"-"+p[0];}return str;}
function fmtIndian(iso){if(!iso) return "";const d=new Date(iso);if(isNaN(d)) return iso;return d.toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"});}
function isPast(y,m){return y<TODAY.getFullYear()||(y===TODAY.getFullYear()&&m<TODAY.getMonth());}
function isCurrent(y,m){return y===TODAY.getFullYear()&&m===TODAY.getMonth();}
function isFuture(y,m){return !isPast(y,m)&&!isCurrent(y,m);}
function applyExpFilter(entries,filter){
  if(filter==="all") return entries;
  const now=new Date();
  if(filter==="3m"){const c=new Date(now.getFullYear(),now.getMonth()-2,1);return entries.filter(e=>new Date(e.year,e.month,1)>=c);}
  if(filter==="6m"){const c=new Date(now.getFullYear(),now.getMonth()-5,1);return entries.filter(e=>new Date(e.year,e.month,1)>=c);}
  if(filter==="1y"){const c=new Date(now.getFullYear(),now.getMonth()-11,1);return entries.filter(e=>new Date(e.year,e.month,1)>=c);}
  if(filter==="lastyear"){const ly=now.getFullYear()-1;return entries.filter(e=>e.year===ly);}
  const yr=parseInt(filter);if(!isNaN(yr)) return entries.filter(e=>e.year===yr);
  return entries;
}
function initData(){
  return{
    flats:FLATS.reduce((acc,num)=>({...acc,[num]:{ownerName:"Owner "+num,ownerPhone:"9999999999",ownerEmail:"",ownerAltName:"",ownerAltPhone:"",ownerAltRelation:"",ownerStayingSince:"",ownerAdults:1,ownerKids:0,previousOwners:[],ownerOccupied:false,currentTenant:null,tenantHistory:[]}}),{}),
    collections:FLATS.reduce((acc,num)=>{const months={};YEARS.forEach(y=>MONTHS.forEach((_,i)=>{months[y+"-"+i]={amount:0,paid:false,advance:false};}));return{...acc,[num]:months};},{}),
    paymentLedger:FLATS.reduce((acc,num)=>({...acc,[num]:[]}),{}),
    specialCollections:[],
    expenseCategories:JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    expenses:[],meetings:[],incidents:[],watchmanLeaves:[],
    building:{name:"GM Jelani Heights",totalFlats:22,shareCode:"APT"+Math.random().toString(36).substring(2,8).toUpperCase()},
    auditedPeriods:[]
  };
}

function NavBar({view,setView}){
  return(
    <nav className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
        {[["dashboard","📊 Dashboard"],["collections","💰 Collections"],["special","🎯 Special"],["expenses","📈 Expenses"],["meetings","📋 Meetings"],["incidents","🚨 Incidents"],["watchman","👷 Watchman"],["audit","📋 Audit"]].map(([v,label])=>(
          <button key={v} onClick={()=>setView(v)} className={"px-3 py-3 border-b-2 font-semibold text-xs whitespace-nowrap "+(view===v?"border-blue-600 text-blue-600":"border-transparent text-gray-600 hover:text-gray-800")}>{label}</button>
        ))}
      </div>
    </nav>
  );
}
function MetricCard({label,value,sub,bg,onClick,borderColor}){
  return(
    <div onClick={onClick} className={bg+" rounded-lg p-4 border-l-4 "+(borderColor||"border-blue-500")+" shadow "+(onClick?"cursor-pointer hover:shadow-md transition":"")}>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      {sub&&<p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      {onClick&&<p className="text-xs text-blue-500 mt-1 font-semibold">View →</p>}
    </div>
  );
}
function YMSel({currentYear,setCurrentYear,currentMonth,setCurrentMonth}){
  return(
    <div className="flex gap-2 items-center">
      <select value={currentYear} onChange={e=>setCurrentYear(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm font-semibold">{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>
      <select value={currentMonth} onChange={e=>setCurrentMonth(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm font-semibold">{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
    </div>
  );
}
function StatusBadge({status}){
  if(status==="owner") return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Owner</span>;
  if(status==="tenant") return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">Tenant</span>;
  return <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">Vacant</span>;
}
function ExpFilterBar({filter,setFilter,entries}){
  const yrs=[...new Set(entries.map(e=>e.year))].sort();
  const opts=[["all","All Time"],["3m","Last 3M"],["6m","Last 6M"],["1y","Last 1Y"],["lastyear","Last Cal. Year"],...yrs.map(y=>[String(y),String(y)])];
  return(
    <div className="flex flex-wrap gap-2 items-center bg-white rounded-lg shadow px-4 py-3">
      <span className="text-xs font-bold text-gray-500 mr-1">FILTER:</span>
      {opts.map(([val,lbl])=>(<button key={val} onClick={()=>setFilter(val)} className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition "+(filter===val?"bg-blue-600 text-white border-blue-600":"border-gray-300 text-gray-600 hover:bg-gray-50")}>{lbl}</button>))}
    </div>
  );
}

function RecordPaymentModal({paymentFlat,flatData,collections,onClose,onSubmit,isAdmin}){
  const [form,setForm]=useState({date:TODAY.toISOString().split("T")[0],amount:"",method:"Cash",receivedFrom:"",comments:"",selectedMonths:[]});
  function getCol(y,m){return(collections[paymentFlat]&&collections[paymentFlat][y+"-"+m])||{amount:5000,paid:false,advance:false};}
  const unpaid=[];
  YEARS.forEach(y=>MONTHS.forEach((_,m)=>{const c=getCol(y,m);if(!c.paid) unpaid.push({year:y,month:m,key:y+"-"+m,amount:c.amount,future:isFuture(y,m)});}));
  const shown=unpaid.slice(0,36);
  function toggleMonth(key,year,month){setForm(f=>{const ex=f.selectedMonths.find(s=>s.key===key);return{...f,selectedMonths:ex?f.selectedMonths.filter(s=>s.key!==key):[...f.selectedMonths,{key,year,month}]};});}
  const selTotal=form.selectedMonths.reduce((s,m)=>s+getCol(m.year,m.month).amount,0);
  const diff=parseFloat(form.amount||0)-selTotal;
  const name=flatData.currentTenant?flatData.currentTenant.name:flatData.ownerName;
  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-4 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white rounded-t-2xl">
          <div><h2 className="text-lg font-bold text-gray-800">💳 Record Payment — Flat {paymentFlat}</h2><p className="text-xs text-gray-500">{name}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Received Date *</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Amount (₹) *</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} disabled={!isAdmin} placeholder="e.g. 5000" className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"/></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Received Mode</label><select value={form.method} onChange={e=>setForm({...form,method:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Received From</label><input type="text" value={form.receivedFrom} onChange={e=>setForm({...form,receivedFrom:e.target.value})} disabled={!isAdmin} placeholder="Name / UPI ref..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Comments</label><input type="text" value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})} disabled={!isAdmin} placeholder="Any additional notes..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">SELECT MONTHS THIS PAYMENT COVERS</p>
            {shown.length===0?<p className="text-sm text-green-600 font-semibold bg-green-50 p-3 rounded-lg">✅ No pending months!</p>:(
              <div className="grid grid-cols-4 gap-2">
                {shown.map(m=>{const sel=form.selectedMonths.find(s=>s.key===m.key);return(
                  <button key={m.key} onClick={()=>isAdmin&&toggleMonth(m.key,m.year,m.month)} disabled={!isAdmin} className={"rounded-lg px-2 py-2 text-xs font-bold border-2 transition text-center "+(sel?"border-green-500 bg-green-100 text-green-700":m.future?"border-purple-300 bg-purple-50 text-purple-600":"border-orange-300 bg-orange-50 text-orange-700")}>
                    <p>{MONTHS[m.month]} {m.year}</p><p className="font-normal mt-0.5">₹{m.amount.toLocaleString()}</p>
                    {m.future&&<p className="text-purple-500 font-semibold mt-0.5">Advance</p>}
                  </button>
                );})}
              </div>
            )}
          </div>
          {form.selectedMonths.length>0&&(
            <div className={"rounded-xl p-4 border-2 "+(diff===0?"bg-green-50 border-green-300":diff>0?"bg-blue-50 border-blue-300":"bg-red-50 border-red-300")}>
              <div className="flex justify-between text-sm font-semibold"><span>Amount Received:</span><span>₹{parseFloat(form.amount||0).toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Months Selected ({form.selectedMonths.length}):</span><span>₹{selTotal.toLocaleString()}</span></div>
              <div className={"flex justify-between text-sm font-bold mt-1 pt-1 border-t "+(diff===0?"text-green-700":diff>0?"text-blue-700":"text-red-700")}>
                <span>{diff===0?"✅ Exact match":diff>0?"💰 Advance: ₹"+diff.toLocaleString():"⚠️ Short: ₹"+Math.abs(diff).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            {isAdmin&&<button onClick={()=>onSubmit(form)} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 text-sm">✓ Confirm Payment</button>}
            <button onClick={onClose} className="px-6 py-2.5 bg-gray-400 text-white rounded-lg font-bold text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryManager({cats,onClose,onAddCat,onDeleteCat,onRenameCat,onAddSub,onDeleteSub,onRenameSub,isAdmin}){
  const [newCat,setNewCat]=useState("");const [newSub,setNewSub]=useState({});const [editCat,setEditCat]=useState(null);const [editSub,setEditSub]=useState(null);
  return(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-10 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white"><h2 className="text-xl font-bold">⚙️ Manage Categories</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button></div>
        <div className="p-6 space-y-5">
          {isAdmin&&(
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-xs font-bold text-blue-700 mb-2">ADD NEW CATEGORY</p>
              <div className="flex gap-2"><input type="text" value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){onAddCat(newCat);setNewCat("");}}} placeholder="Category name..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/><button onClick={()=>{onAddCat(newCat);setNewCat("");}} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Add</button></div>
            </div>
          )}
          {Object.keys(cats).map(cat=>(
            <div key={cat} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-gray-100 px-4 py-3">
                {isAdmin&&editCat===cat?(<div className="flex gap-2 flex-1"><input type="text" defaultValue={cat} id={"ec-"+cat} className="flex-1 px-2 py-1 border rounded text-sm font-semibold" autoFocus/><button onClick={()=>{const el=document.getElementById("ec-"+cat);onRenameCat(cat,el.value);setEditCat(null);}} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-bold">Save</button><button onClick={()=>setEditCat(null)} className="px-3 py-1 bg-gray-400 text-white rounded text-xs font-bold">Cancel</button></div>):<span className="font-bold text-gray-800">{cat}</span>}
                {isAdmin&&<div className="flex gap-2 ml-3">{!editCat&&<button onClick={()=>setEditCat(cat)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 size={14}/></button>}<button onClick={()=>onDeleteCat(cat)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14}/></button></div>}
              </div>
              <div className="p-3 space-y-2">
                {cats[cat].map(sub=>(<div key={sub} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                  {isAdmin&&editSub&&editSub.cat===cat&&editSub.sub===sub?(<div className="flex gap-2 flex-1"><input type="text" defaultValue={sub} id={"es-"+cat+sub} className="flex-1 px-2 py-1 border rounded text-sm" autoFocus/><button onClick={()=>{const el=document.getElementById("es-"+cat+sub);onRenameSub(cat,sub,el.value);setEditSub(null);}} className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold">Save</button><button onClick={()=>setEditSub(null)} className="px-2 py-1 bg-gray-400 text-white rounded text-xs font-bold">Cancel</button></div>):<span className="text-sm text-gray-700">• {sub}</span>}
                  {isAdmin&&<div className="flex gap-2 ml-2">{!editSub&&<button onClick={()=>setEditSub({cat,sub})} className="text-blue-400 hover:text-blue-600 p-1"><Edit2 size={12}/></button>}<button onClick={()=>onDeleteSub(cat,sub)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12}/></button></div>}
                </div>))}
                {isAdmin&&<div className="flex gap-2 mt-2"><input type="text" value={newSub[cat]||""} onChange={e=>setNewSub({...newSub,[cat]:e.target.value})} onKeyDown={e=>{if(e.key==="Enter"){onAddSub(cat,newSub[cat]||"");setNewSub({...newSub,[cat]:""});}}} placeholder="Add sub-category..." className="flex-1 px-3 py-1.5 border rounded text-sm bg-white"/><button onClick={()=>{onAddSub(cat,newSub[cat]||"");setNewSub({...newSub,[cat]:""});}} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700">+ Add</button></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CsvModal({onClose,onImport,isAdmin}){
  const [preview,setPreview]=useState(null);const [errors,setErrors]=useState([]);const fileRef=useRef(null);
  const csvText=[CSV_HEADERS].concat(CSV_SAMPLES.map(r=>r.map(c=>'"'+String(c)+'"'))).map(r=>r.join(",")).join("\n");
  function parseFile(file){const reader=new FileReader();reader.onload=e=>{try{const text=e.target.result;const lines=text.trim().split("\n").map(l=>l.trim());const headers=lines[0].split(",").map(h=>h.replace(/^"|"$/g,"").trim().toLowerCase());const rows=lines.slice(1).map(line=>{const vals=[];let cur="",inQ=false;for(let i=0;i<line.length;i++){if(line[i]==='"'){inQ=!inQ;}else if(line[i]===","&&!inQ){vals.push(cur.trim());cur="";}else cur+=line[i];}vals.push(cur.trim());const obj={};headers.forEach((h,i)=>{obj[h]=(vals[i]||"").replace(/^"|"$/g,"").trim();});return obj;}).filter(r=>r["flat_number"]);const errs=[],prev=[];rows.forEach((row,idx)=>{const fn=parseInt(row["flat_number"]);if(!FLATS.includes(fn)){errs.push("Row "+(idx+2)+": Flat "+fn+" not found.");return;}const occ=(row["occupied_by"]||"").toLowerCase();if(!["owner","tenant","vacant"].includes(occ)){errs.push("Row "+(idx+2)+": occupied_by must be Owner/Tenant/Vacant.");return;}prev.push({flatNum:fn,occ,row});});setErrors(errs);setPreview(prev);}catch(err){setErrors(["Parse error: "+err.message]);setPreview(null);}};reader.readAsText(file);}
  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-start justify-center pt-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white rounded-t-2xl"><h2 className="text-xl font-bold">📥 Bulk Import via CSV</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button></div>
        <div className="p-6 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4"><p className="text-sm font-bold text-blue-700 mb-2">Step 1 — Copy the CSV Template</p><textarea readOnly value={csvText} rows={5} onClick={e=>e.target.select()} className="w-full text-xs font-mono bg-white border-2 border-blue-300 rounded-lg p-3 resize-y text-gray-700"/></div>
          {isAdmin&&<div className="bg-green-50 border border-green-200 rounded-xl p-4"><p className="text-sm font-bold text-green-700 mb-2">Step 2 — Upload Filled CSV</p><input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e=>{if(e.target.files[0]) parseFile(e.target.files[0]);}}/><button onClick={()=>fileRef.current.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"><Upload size={15}/> Choose CSV File</button></div>}
          {errors.length>0&&<div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-sm font-bold text-red-700 mb-2">⚠️ Errors</p>{errors.map((e,i)=><p key={i} className="text-xs text-red-600">• {e}</p>)}</div>}
          {preview&&preview.length>0&&(<div><p className="text-sm font-bold text-gray-700 mb-2">Preview — {preview.length} rows</p><div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-gray-100"><tr><th className="px-3 py-2 text-left">Flat</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Owner</th><th className="px-3 py-2 text-left">Tenant</th></tr></thead><tbody>{preview.map(item=>(<tr key={item.flatNum} className="border-t hover:bg-gray-50"><td className="px-3 py-2 font-bold text-blue-600">{item.flatNum}</td><td className="px-3 py-2"><StatusBadge status={item.occ==="owner"?"owner":item.occ==="tenant"?"tenant":"vacant"}/></td><td className="px-3 py-2">{item.row["owner_name"]||"—"}</td><td className="px-3 py-2">{item.occ==="tenant"?(item.row["tenant_name"]||"—"):"—"}</td></tr>))}</tbody></table></div>{isAdmin&&<div className="flex gap-3 mt-4"><button onClick={()=>onImport(preview)} className="px-5 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700">✅ Confirm & Import {preview.length} Flats</button><button onClick={()=>{setPreview(null);setErrors([]);}} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Clear</button></div>}</div>)}
        </div>
      </div>
    </div>
  );
}

function ExpDetailView({title,subtitle,allEntries,onBack,navView,setView}){
  const [filter,setFilter]=useState("all");
  const filtered=applyExpFilter(allEntries,filter);
  const total=filtered.reduce((s,e)=>s+e.amount,0);
  const avg=filtered.length?Math.round(total/filtered.length):0;
  const trendMap={};filtered.forEach(e=>{const k=e.year+"-"+String(e.month).padStart(2,"0");trendMap[k]=(trendMap[k]||0)+e.amount;});
  const trendData=Object.entries(trendMap).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>{const[y,m]=k.split("-");return{label:MONTHS[parseInt(m)]+" "+y.slice(2),amount:v};});
  const subMap={};filtered.forEach(e=>{subMap[e.subcategory]=(subMap[e.subcategory]||0)+e.amount;});
  const subBreakdown=Object.entries(subMap).map(([name,value])=>({name,value}));
  const sorted=[...filtered].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month);
  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><button onClick={onBack} className="text-blue-100 hover:text-white mb-2 font-semibold text-sm">← Back</button><h1 className="text-3xl font-bold">{title}</h1><p className="text-blue-100 text-sm">{subtitle}</p></header>
      <NavBar view={navView} setView={setView}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <ExpFilterBar filter={filter} setFilter={setFilter} entries={allEntries}/>
        <div className="grid grid-cols-3 gap-4"><MetricCard label="Total" value={"₹"+total.toLocaleString()} bg="bg-emerald-50" borderColor="border-emerald-500"/><MetricCard label="Avg/Entry" value={"₹"+avg.toLocaleString()} bg="bg-blue-50" borderColor="border-blue-400"/><MetricCard label="Entries" value={filtered.length} bg="bg-purple-50" borderColor="border-purple-400"/></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-5"><h3 className="font-bold mb-4">📈 Trend</h3>{trendData.length===0?<p className="text-gray-400 text-sm text-center py-10">No data</p>:<ResponsiveContainer width="100%" height={200}><BarChart data={trendData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label" tick={{fontSize:10}} angle={-30} textAnchor="end" height={50}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>"₹"+v.toLocaleString()}/><Bar dataKey="amount" fill="#3b82f6" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>}</div>
          <div className="bg-white rounded-lg shadow p-5"><h3 className="font-bold mb-4">🥧 By Sub-Item</h3>{subBreakdown.length===0?<p className="text-gray-400 text-sm text-center py-10">No data</p>:<ResponsiveContainer width="100%" height={200}><PieChart><Pie data={subBreakdown} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={p=>p.name.split(" ")[0]+" "+(p.percent*100).toFixed(0)+"%"}>{subBreakdown.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={v=>"₹"+v.toLocaleString()}/><Legend/></PieChart></ResponsiveContainer>}</div>
        </div>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <div className="px-5 py-3 border-b"><h3 className="font-bold">All Entries ({filtered.length})</h3></div>
          <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Year</th><th className="px-4 py-3 text-left">Month</th><th className="px-4 py-3 text-left">Sub-Item</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Units</th></tr></thead>
          <tbody>{sorted.length===0&&<tr><td colSpan={5} className="text-center py-8 text-gray-400">No entries</td></tr>}{sorted.map(e=>(<tr key={e.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3">{e.year}</td><td className="px-4 py-3">{MONTHS[e.month]}</td><td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">{e.subcategory}</span></td><td className="px-4 py-3 text-right font-semibold">₹{e.amount.toLocaleString()}</td><td className="px-4 py-3 text-right text-gray-500">{e.units} {e.unitType}</td></tr>))}</tbody>
          {filtered.length>0&&<tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={3} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-right font-bold text-emerald-700">₹{filtered.reduce((s,e)=>s+e.amount,0).toLocaleString()}</td><td></td></tr></tfoot>}
          </table>
        </div>
      </main>
    </div>
  );
}

function MeetingsPage({data,setData,setView,navView,isAdmin}){
  const [selId,setSelId]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [nf,setNf]=useState({date:TODAY.toISOString().split("T")[0],title:"",year:TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear(),month:TODAY.getMonth(),venue:"",chairperson:"",attendees:"",description:""});
  const [newTask,setNewTask]=useState({description:"",owner:"",dueDate:"",link:"",priority:"Medium",status:"Not Started"});
  const [newNote,setNewNote]=useState("");
  const [expandedTask,setExpandedTask]=useState(null);
  const [taskComment,setTaskComment]=useState({});
  const [addingComment,setAddingComment]=useState(null);

  const mtg=selId?data.meetings.find(m=>m.id===selId):null;
  function updMtg(upd){setData(p=>({...p,meetings:p.meetings.map(m=>m.id===selId?{...m,...upd}:m)}));}
  function addMeeting(){if(!nf.title.trim()) return;const m={id:Date.now().toString(),...nf,actionItems:[],notes:[],decisions:[]};setData(p=>({...p,meetings:[...p.meetings,m]}));setSelId(m.id);setShowNew(false);}
  function delMeeting(id){if(!window.confirm("Delete meeting?")) return;setData(p=>({...p,meetings:p.meetings.filter(m=>m.id!==id)}));if(selId===id) setSelId(null);}
  function addTask(){if(!newTask.description.trim()) return;const t={id:Date.now().toString(),...newTask,comments:[],createdAt:TODAY.toISOString().split("T")[0]};updMtg({actionItems:[...(mtg.actionItems||[]),t]});setNewTask({description:"",owner:"",dueDate:"",link:"",priority:"Medium",status:"Not Started"});}
  function updTask(tid,upd){updMtg({actionItems:(mtg.actionItems||[]).map(t=>t.id===tid?{...t,...upd}:t)});}
  function delTask(tid){updMtg({actionItems:(mtg.actionItems||[]).filter(t=>t.id!==tid)});}
  function addTaskComment(tid){const txt=(taskComment[tid]||"").trim();if(!txt) return;const comment={id:Date.now().toString(),text:txt,date:TODAY.toISOString().split("T")[0]};updTask(tid,{comments:[...((mtg.actionItems||[]).find(t=>t.id===tid)?.comments||[]),comment]});setTaskComment(prev=>({...prev,[tid]:""}));setAddingComment(null);}
  function delTaskComment(tid,cid){const task=(mtg.actionItems||[]).find(t=>t.id===tid);updTask(tid,{comments:(task.comments||[]).filter(c=>c.id!==cid)});}
  function addNote(){if(!newNote.trim()) return;updMtg({notes:[...(mtg.notes||[]),{id:Date.now().toString(),text:newNote,date:TODAY.toISOString().split("T")[0]}]});setNewNote("");}
  function addDecision(txt){if(!txt.trim()) return;updMtg({decisions:[...(mtg.decisions||[]),{id:Date.now().toString(),text:txt}]});}

  if(selId&&mtg){
    const tasks=mtg.actionItems||[];
    const total=tasks.length,done=tasks.filter(t=>t.status==="Completed").length,pct=total?Math.round(done/total*100):0;
    const bySt={};TASK_STATUSES.forEach(s=>{bySt[s]=tasks.filter(t=>t.status===s).length;});
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6">
          <button onClick={()=>setSelId(null)} className="text-indigo-100 hover:text-white mb-2 font-semibold text-sm">← All Meetings</button>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div><h1 className="text-2xl font-bold">{mtg.title}</h1><p className="text-indigo-100 text-sm mt-1">📅 {fmtIndian(mtg.date)} · 📍 {mtg.venue||"TBD"} · 🪑 {mtg.chairperson||"—"}</p>{mtg.attendees&&<p className="text-indigo-200 text-xs mt-0.5">👥 {mtg.attendees}</p>}</div>
            <span className="px-3 py-1 bg-white text-indigo-700 rounded-full text-xs font-bold self-start">{MONTHS[mtg.month]} {mtg.year}</span>
          </div>
        </header>
        <NavBar view={navView} setView={setView}/>
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-center mb-3"><h3 className="font-bold text-gray-700">📊 Progress Overview</h3><span className="text-sm font-semibold text-gray-600">{done}/{total} completed · {pct}%</span></div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden"><div className="bg-indigo-500 h-3 rounded-full transition-all duration-500" style={{width:pct+"%"}}></div></div>
            <div className="grid grid-cols-5 gap-2">{TASK_STATUSES.map(s=>{const st=STATUS_STYLE[s];return(<div key={s} className={`text-center p-2 rounded-lg border ${st.bg} ${st.border}`}><p className={`text-xl font-bold ${st.text}`}>{bySt[s]||0}</p><p className={`text-xs font-semibold ${st.text} leading-tight mt-0.5`}>{s}</p></div>);})}</div>
          </div>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-700">✅ Action Items ({tasks.length})</h3>
              {tasks.length>0&&<span className="text-xs text-gray-400">{tasks.filter(t=>t.status!=="Completed"&&t.status!=="Deferred").length} pending</span>}
            </div>
            {tasks.length===0&&<p className="text-sm text-gray-400 italic text-center py-8">No action items yet.</p>}
            <div className="divide-y">
              {tasks.map(t=>{
                const st=STATUS_STYLE[t.status||"Not Started"];
                const isExp=expandedTask===t.id;
                const comments=t.comments||[];
                const isOverdue=t.dueDate&&new Date(t.dueDate)<TODAY&&t.status!=="Completed";
                return(
                  <div key={t.id} className="hover:bg-gray-50 transition">
                    <div className="px-5 py-3 flex items-start gap-3">
                      <button onClick={()=>{if(!isAdmin) return;const idx=TASK_STATUSES.indexOf(t.status||"Not Started");updTask(t.id,{status:TASK_STATUSES[(idx+1)%TASK_STATUSES.length]});}} disabled={!isAdmin} title="Click to cycle status" className={`mt-0.5 px-2 py-1 rounded-lg text-xs font-bold border whitespace-nowrap flex-shrink-0 ${st.bg} ${st.text} ${st.border} ${isAdmin?"hover:opacity-80 cursor-pointer":"cursor-default"}`}>
                        {st.icon} {t.status||"Not Started"}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={"text-sm font-semibold "+(t.status==="Completed"?"line-through text-gray-400":"text-gray-800")}>{t.description}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 items-center">
                          {t.owner&&<span>👤 {t.owner}</span>}
                          {t.dueDate&&<span className={isOverdue?"text-red-500 font-semibold":""}>📅 {fmtIndian(t.dueDate)}{isOverdue&&" ⚠️"}</span>}
                          <span className={PRIORITY_STYLE[t.priority||"Medium"]}>⚡ {t.priority||"Medium"}</span>
                          {t.link&&<a href={t.link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5"><ExternalLink size={10}/> Link</a>}
                          {comments.length>0&&<span className="text-indigo-500 font-semibold">💬 {comments.length}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-1">
                        {isAdmin&&<button onClick={()=>setAddingComment(addingComment===t.id?null:t.id)} title="Add comment" className={"p-1 rounded "+(addingComment===t.id?"text-indigo-600 bg-indigo-50":"text-indigo-400 hover:text-indigo-600")}><MessageSquare size={14}/></button>}
                        <button onClick={()=>setExpandedTask(isExp?null:t.id)} className="p-1 text-gray-400 hover:text-gray-600">{isExp?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
                        {isAdmin&&<button onClick={()=>delTask(t.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14}/></button>}
                      </div>
                    </div>
                    {(comments.length>0||addingComment===t.id)&&(
                      <div className="px-5 pb-3 ml-16 space-y-2">
                        {comments.map(c=>(<div key={c.id} className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2"><MessageSquare size={12} className="text-indigo-400 mt-0.5 flex-shrink-0"/><div className="flex-1"><p className="text-xs text-gray-700">{c.text}</p><p className="text-xs text-gray-400 mt-0.5">{fmtIndian(c.date)}</p></div>{isAdmin&&<button onClick={()=>delTaskComment(t.id,c.id)} className="text-red-300 hover:text-red-500"><Trash2 size={11}/></button>}</div>))}
                        {isAdmin&&addingComment===t.id&&(<div className="flex gap-2"><input type="text" value={taskComment[t.id]||""} onChange={e=>setTaskComment(prev=>({...prev,[t.id]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter") addTaskComment(t.id);}} placeholder="Add a status comment or update..." autoFocus className="flex-1 px-3 py-1.5 border border-indigo-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-400 outline-none"/><button onClick={()=>addTaskComment(t.id)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">Post</button><button onClick={()=>setAddingComment(null)} className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold">✕</button></div>)}
                      </div>
                    )}
                    {isExp&&(
                      <div className="border-t bg-indigo-50 px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Description</label><input type="text" value={t.description} onChange={e=>isAdmin&&updTask(t.id,{description:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Status</label><select value={t.status||"Not Started"} onChange={e=>isAdmin&&updTask(t.id,{status:e.target.value})} disabled={!isAdmin} className={`w-full px-2 py-1.5 border rounded text-sm font-semibold ${STATUS_STYLE[t.status||"Not Started"].bg} ${STATUS_STYLE[t.status||"Not Started"].text}`}>{TASK_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Owner</label><input type="text" value={t.owner||""} onChange={e=>isAdmin&&updTask(t.id,{owner:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label><input type="date" value={t.dueDate||""} onChange={e=>isAdmin&&updTask(t.id,{dueDate:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label><select value={t.priority||"Medium"} onChange={e=>isAdmin&&updTask(t.id,{priority:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm">{["High","Medium","Low"].map(p=><option key={p}>{p}</option>)}</select></div>
                        <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Reference Link</label><input type="url" value={t.link||""} onChange={e=>isAdmin&&updTask(t.id,{link:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isAdmin&&(
              <div className="border-t bg-indigo-50 p-5">
                <p className="text-xs font-bold text-indigo-700 mb-3">+ ADD ACTION ITEM</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <div className="col-span-2 md:col-span-3"><input type="text" value={newTask.description} onChange={e=>setNewTask({...newTask,description:e.target.value})} placeholder="Task description *" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><input type="text" value={newTask.owner} onChange={e=>setNewTask({...newTask,owner:e.target.value})} placeholder="Assigned to..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><input type="date" value={newTask.dueDate} onChange={e=>setNewTask({...newTask,dueDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><select value={newTask.status} onChange={e=>setNewTask({...newTask,status:e.target.value})} className={`w-full px-3 py-2 border rounded-lg text-sm font-semibold ${STATUS_STYLE[newTask.status].bg} ${STATUS_STYLE[newTask.status].text}`}>{TASK_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div><select value={newTask.priority} onChange={e=>setNewTask({...newTask,priority:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option>High</option><option>Medium</option><option>Low</option></select></div>
                  <div className="col-span-2"><input type="url" value={newTask.link} onChange={e=>setNewTask({...newTask,link:e.target.value})} placeholder="Reference link (optional)" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                </div>
                <button onClick={addTask} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">+ Add Task</button>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold text-gray-700 mb-4">🏛️ Key Decisions</h3>
            <div className="space-y-2 mb-3">{(mtg.decisions||[]).map(d=>(<div key={d.id} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"><p className="text-sm text-gray-700">📌 {d.text}</p>{isAdmin&&<button onClick={()=>updMtg({decisions:(mtg.decisions).filter(x=>x.id!==d.id)})} className="text-red-400 hover:text-red-600 ml-3"><Trash2 size={13}/></button>}</div>))}</div>
            {isAdmin&&<div className="flex gap-2"><input id="dec-inp" type="text" placeholder="Record a decision..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/><button onClick={()=>{const el=document.getElementById("dec-inp");if(el.value){addDecision(el.value);el.value="";}}} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Add</button></div>}
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold text-gray-700 mb-4">📝 Meeting Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[["Title","title"],["Venue","venue"],["Chairperson","chairperson"],["Attendees","attendees"]].map(([l,f])=>(<div key={f}><label className="block text-xs font-semibold text-gray-500 mb-1">{l}</label><input type="text" value={mtg[f]||""} onChange={e=>isAdmin&&updMtg({[f]:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>))}
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" value={mtg.date||""} onChange={e=>isAdmin&&updMtg({date:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-bold text-gray-700 mb-4">🗒️ Meeting Notes</h3>
            <div className="space-y-2 mb-3">{(mtg.notes||[]).map(n=>(<div key={n.id} className="flex items-start justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2"><div><p className="text-sm text-gray-700">{n.text}</p><p className="text-xs text-gray-400 mt-0.5">{fmtIndian(n.date)}</p></div>{isAdmin&&<button onClick={()=>updMtg({notes:(mtg.notes).filter(x=>x.id!==n.id)})} className="text-red-400 hover:text-red-600 ml-2"><Trash2 size={13}/></button>}</div>))}</div>
            {isAdmin&&<div className="flex gap-2"><input type="text" value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") addNote();}} placeholder="Add a note..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/><button onClick={addNote} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600">Add</button></div>}
          </div>
        </main>
      </div>
    );
  }

  const allTasks=data.meetings.flatMap(m=>m.actionItems||[]);
  const openTasks=allTasks.filter(t=>t.status!=="Completed"&&t.status!=="Deferred");
  const overdueTasks=allTasks.filter(t=>t.dueDate&&new Date(t.dueDate)<TODAY&&t.status!=="Completed");
  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6"><h1 className="text-3xl font-bold">📋 Meetings</h1></header>
      <NavBar view={navView} setView={setView}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {data.meetings.length>0&&(
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-indigo-400 text-center"><p className="text-2xl font-bold text-indigo-700">{data.meetings.length}</p><p className="text-xs text-gray-500 font-semibold mt-0.5">Total Meetings</p></div>
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-400 text-center"><p className="text-2xl font-bold text-blue-700">{openTasks.length}</p><p className="text-xs text-gray-500 font-semibold mt-0.5">Open Tasks</p></div>
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-400 text-center"><p className="text-2xl font-bold text-red-600">{overdueTasks.length}</p><p className="text-xs text-gray-500 font-semibold mt-0.5">Overdue Tasks</p></div>
            <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-400 text-center"><p className="text-2xl font-bold text-green-700">{allTasks.filter(t=>t.status==="Completed").length}</p><p className="text-xs text-gray-500 font-semibold mt-0.5">Completed</p></div>
          </div>
        )}
        {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold text-sm"><Plus size={16}/> New Meeting</button>}
        {showNew&&isAdmin&&(
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-indigo-500">
            <h3 className="font-bold mb-4 text-gray-700">Create Meeting</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} placeholder="e.g. Q1 Residents Meeting" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" value={nf.date} onChange={e=>setNf({...nf,date:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Year</label><select value={nf.year} onChange={e=>setNf({...nf,year:parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm">{YEARS.map(y=><option key={y}>{y}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Month</label><select value={nf.month} onChange={e=>setNf({...nf,month:parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm">{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Venue</label><input type="text" value={nf.venue} onChange={e=>setNf({...nf,venue:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Chairperson</label><input type="text" value={nf.chairperson} onChange={e=>setNf({...nf,chairperson:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Attendees</label><input type="text" value={nf.attendees} onChange={e=>setNf({...nf,attendees:e.target.value})} placeholder="Flat 101, 102..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-2"><button onClick={addMeeting} className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700">Create</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div>
          </div>
        )}
        {data.meetings.length===0&&!showNew&&<div className="text-center py-16 text-gray-400"><p className="text-5xl mb-4">📋</p><p className="text-lg font-semibold">No meetings yet</p></div>}
        {[...data.meetings].reverse().map(m=>{
          const tasks=m.actionItems||[];const done=tasks.filter(t=>t.status==="Completed").length;const pct=tasks.length?Math.round(done/tasks.length*100):0;
          const overdue=tasks.filter(t=>t.dueDate&&new Date(t.dueDate)<TODAY&&t.status!=="Completed");
          return(
            <div key={m.id} className="bg-white rounded-xl shadow hover:shadow-md transition overflow-hidden cursor-pointer" onClick={()=>setSelId(m.id)}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1"><h3 className="font-bold text-gray-800">{m.title}</h3><span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">{MONTHS[m.month]} {m.year}</span></div>
                    <p className="text-xs text-gray-500">📅 {fmtIndian(m.date)} · 📍 {m.venue||"TBD"} · 🪑 {m.chairperson||"—"}</p>
                  </div>
                  {isAdmin&&<button onClick={e=>{e.stopPropagation();delMeeting(m.id);}} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 size={15}/></button>}
                </div>
                {tasks.length>0&&(
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{done}/{tasks.length} tasks</span><span className="font-bold text-indigo-600">{pct}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden"><div className="bg-indigo-500 h-2 rounded-full" style={{width:pct+"%"}}></div></div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

function IncidentsPage({data,setData,setView,navView,isAdmin}){
  const [showNew,setShowNew]=useState(false);
  const [exp,setExp]=useState(null);
  const [newUpdate,setNewUpdate]=useState("");
  const [nf,setNf]=useState({date:TODAY.toISOString().split("T")[0],title:"",severity:"Medium",location:"",reportedBy:"",description:"",affectedFlats:"",status:"Open"});
  function add(){if(!nf.title.trim()) return;const inc={id:Date.now().toString(),...nf,updates:[],resolvedDate:"",resolutionNotes:""};setData(p=>({...p,incidents:[inc,...(p.incidents||[])]}));setShowNew(false);setNf({date:TODAY.toISOString().split("T")[0],title:"",severity:"Medium",location:"",reportedBy:"",description:"",affectedFlats:"",status:"Open"});}
  function upd(id,u){setData(p=>({...p,incidents:(p.incidents||[]).map(i=>i.id===id?{...i,...u}:i)}));}
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,incidents:(p.incidents||[]).filter(i=>i.id!==id)}));}
  function addUpd(inc){if(!newUpdate.trim()) return;upd(inc.id,{updates:[...(inc.updates||[]),{id:Date.now().toString(),text:newUpdate,date:TODAY.toISOString().split("T")[0]}]});setNewUpdate("");}
  const incidents=data.incidents||[];const open=incidents.filter(i=>i.status==="Open"||i.status==="In Progress").length;
  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-red-600 to-red-700 text-white p-6"><h1 className="text-3xl font-bold">🚨 Major Incidents</h1><p className="text-red-100 text-sm mt-1">{open} open · {incidents.length} total</p></header>
      <NavBar view={navView} setView={setView}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold text-sm"><Plus size={16}/> Report Incident</button>}
        {showNew&&isAdmin&&(<div className="bg-white rounded-xl shadow p-6 border-l-4 border-red-500"><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4"><div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" value={nf.date} onChange={e=>setNf({...nf,date:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Severity</label><select value={nf.severity} onChange={e=>setNf({...nf,severity:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{INCIDENT_SEVERITIES.map(s=><option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Status</label><select value={nf.status} onChange={e=>setNf({...nf,status:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{["Open","In Progress","Resolved","Closed"].map(s=><option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Location</label><input type="text" value={nf.location} onChange={e=>setNf({...nf,location:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Reported By</label><input type="text" value={nf.reportedBy} onChange={e=>setNf({...nf,reportedBy:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Affected Flats</label><input type="text" value={nf.affectedFlats} onChange={e=>setNf({...nf,affectedFlats:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Description</label><textarea value={nf.description} onChange={e=>setNf({...nf,description:e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm resize-none"/></div></div><div className="flex gap-2"><button onClick={add} className="px-5 py-2 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700">Report</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>)}
        {incidents.length===0&&!showNew&&<div className="text-center py-16 text-gray-400"><p className="text-5xl mb-4">🚨</p><p>No incidents reported</p></div>}
        {incidents.map(inc=>(<div key={inc.id} className="bg-white rounded-xl shadow overflow-hidden"><div className="p-5"><div className="flex items-start justify-between mb-2"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-bold text-gray-800">{inc.title}</h3><span className={"px-2 py-0.5 rounded-full text-xs font-bold border "+SEV_COLORS[inc.severity]}>{inc.severity}</span><span className={"px-2 py-0.5 rounded-full text-xs font-bold "+(inc.status==="Resolved"||inc.status==="Closed"?"bg-green-100 text-green-700":inc.status==="In Progress"?"bg-blue-100 text-blue-700":"bg-red-100 text-red-700")}>{inc.status}</span></div><div className="flex gap-1">{isAdmin&&<><button onClick={()=>setExp(exp===inc.id?null:inc.id)} className="p-1 text-gray-400 hover:text-gray-600">{exp===inc.id?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button><button onClick={()=>del(inc.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14}/></button></>}</div></div><p className="text-xs text-gray-500">📅 {fmtIndian(inc.date)} · 📍 {inc.location||"—"} · 👤 {inc.reportedBy||"—"}</p>{inc.affectedFlats&&<p className="text-xs text-orange-600 font-semibold mt-1">Affected: {inc.affectedFlats}</p>}{inc.description&&<p className="text-sm text-gray-600 mt-2">{inc.description}</p>}</div>
        {exp===inc.id&&isAdmin&&(<div className="border-t bg-gray-50 p-5 space-y-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div><label className="block text-xs font-semibold text-gray-500 mb-1">Status</label><select value={inc.status} onChange={e=>upd(inc.id,{status:e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm">{["Open","In Progress","Resolved","Closed"].map(s=><option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Severity</label><select value={inc.severity} onChange={e=>upd(inc.id,{severity:e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm">{INCIDENT_SEVERITIES.map(s=><option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Resolved Date</label><input type="date" value={inc.resolvedDate||""} onChange={e=>upd(inc.id,{resolvedDate:e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm"/></div><div className="col-span-2 md:col-span-4"><label className="block text-xs font-semibold text-gray-500 mb-1">Resolution Notes</label><textarea value={inc.resolutionNotes||""} onChange={e=>upd(inc.id,{resolutionNotes:e.target.value})} rows={2} className="w-full px-2 py-1.5 border rounded text-sm resize-none"/></div></div><div><p className="text-xs font-bold text-gray-500 mb-2">ADD UPDATE</p><div className="flex gap-2"><input type="text" value={newUpdate} onChange={e=>setNewUpdate(e.target.value)} placeholder="Add update..." className="flex-1 px-3 py-2 border rounded-lg text-sm"/><button onClick={()=>addUpd(inc)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Add</button></div></div></div>)}</div>))}
      </main>
    </div>
  );
}

function WatchmanPage({data,setData,setView,navView,isAdmin}){
  const [showNew,setShowNew]=useState(false);
  const [nf,setNf]=useState({watchmanName:"",fromDate:TODAY.toISOString().split("T")[0],toDate:"",reason:"",leaveType:"Casual Leave",coverArrangement:"",approvedBy:"",notes:""});
  function days(f,t){if(!f||!t) return 1;const d=Math.ceil((new Date(t)-new Date(f))/(864e5))+1;return d<1?1:d;}
  function add(){if(!nf.watchmanName.trim()||!nf.fromDate) return;const l={id:Date.now().toString(),...nf,status:"Approved"};setData(p=>({...p,watchmanLeaves:[l,...(p.watchmanLeaves||[])]}));setShowNew(false);setNf({watchmanName:"",fromDate:TODAY.toISOString().split("T")[0],toDate:"",reason:"",leaveType:"Casual Leave",coverArrangement:"",approvedBy:"",notes:""});}
  function upd(id,u){setData(p=>({...p,watchmanLeaves:(p.watchmanLeaves||[]).map(l=>l.id===id?{...l,...u}:l)}));}
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,watchmanLeaves:(p.watchmanLeaves||[]).filter(l=>l.id!==id)}));}
  const leaves=data.watchmanLeaves||[];
  const thisMonth=leaves.filter(l=>{const d=new Date(l.fromDate);return d.getFullYear()===TODAY.getFullYear()&&d.getMonth()===TODAY.getMonth();});
  const thisYear=leaves.filter(l=>new Date(l.fromDate).getFullYear()===TODAY.getFullYear());
  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-6"><h1 className="text-3xl font-bold">👷 Watchman Leaves</h1></header>
      <NavBar view={navView} setView={setView}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-3 gap-4"><MetricCard label="This Month" value={thisMonth.length} bg="bg-teal-50" borderColor="border-teal-500"/><MetricCard label="This Year" value={thisYear.length} bg="bg-blue-50" borderColor="border-blue-400"/><MetricCard label="Days (Year)" value={thisYear.reduce((s,l)=>s+days(l.fromDate,l.toDate),0)} bg="bg-orange-50" borderColor="border-orange-400"/></div>
        {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-semibold text-sm"><Plus size={16}/> Add Leave</button>}
        {showNew&&isAdmin&&(<div className="bg-white rounded-xl shadow p-6 border-l-4 border-teal-500"><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-semibold text-gray-500 mb-1">Watchman Name *</label><input type="text" value={nf.watchmanName} onChange={e=>setNf({...nf,watchmanName:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Leave Type</label><select value={nf.leaveType} onChange={e=>setNf({...nf,leaveType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{["Casual Leave","Sick Leave","Emergency Leave","Planned Leave","Absent (Unauthorized)"].map(t=><option key={t}>{t}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label><input type="text" value={nf.reason} onChange={e=>setNf({...nf,reason:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">From *</label><input type="date" value={nf.fromDate} onChange={e=>setNf({...nf,fromDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">To</label><input type="date" value={nf.toDate} onChange={e=>setNf({...nf,toDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Cover By</label><input type="text" value={nf.coverArrangement} onChange={e=>setNf({...nf,coverArrangement:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div></div><div className="flex gap-2"><button onClick={add} className="px-5 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm hover:bg-teal-700">Save</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>)}
        {leaves.length>0&&(<div className="bg-white rounded-xl shadow overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Watchman</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">From</th><th className="px-4 py-3 text-left">To</th><th className="px-4 py-3 text-center">Days</th><th className="px-4 py-3 text-left">Reason</th><th className="px-4 py-3 text-center">Status</th>{isAdmin&&<th className="px-4 py-3"/>}</tr></thead><tbody>{leaves.map(l=>(<tr key={l.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3 font-semibold">{l.watchmanName}</td><td className="px-4 py-3"><span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-semibold">{l.leaveType}</span></td><td className="px-4 py-3 text-xs">{fmtIndian(l.fromDate)}</td><td className="px-4 py-3 text-xs">{l.toDate?fmtIndian(l.toDate):"—"}</td><td className="px-4 py-3 text-center font-bold">{days(l.fromDate,l.toDate)}</td><td className="px-4 py-3 text-xs text-gray-500">{l.reason||"—"}</td><td className="px-4 py-3">{isAdmin?<select value={l.status||"Approved"} onChange={e=>upd(l.id,{status:e.target.value})} className={"text-xs font-semibold px-2 py-1 rounded border "+(l.status==="Approved"?"bg-green-100 text-green-700 border-green-300":l.status==="Pending"?"bg-yellow-100 text-yellow-700 border-yellow-300":"bg-red-100 text-red-700 border-red-300")}>{["Approved","Pending","Rejected"].map(s=><option key={s}>{s}</option>)}</select>:<span className={"text-xs font-semibold px-2 py-1 rounded "+(l.status==="Approved"?"bg-green-100 text-green-700":"bg-yellow-100 text-yellow-700")}>{l.status||"Approved"}</span>}</td>{isAdmin&&<td className="px-4 py-3"><button onClick={()=>del(l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></td>}</tr>))}</tbody></table></div>)}
      </main>
    </div>
  );
}
function AuditPage({data, setData, setView, isAdmin, role}){
  const userRole = role || "admin";
  const [filter, setFilter] = useState("1y");
  const lastCalYear = TODAY.getFullYear()-1;

  const auditedPeriods = (data.auditedPeriods && data.auditedPeriods.length)
    ? data.auditedPeriods
    : [];
  const pendingAudit   = auditedPeriods.find(function(a){return a.status==="pending";}) || null;
  const approvedAudits = auditedPeriods.filter(function(a){return a.status==="approved";});
  const lastYearAudit  = auditedPeriods.find(function(a){return a.year===lastCalYear;}) || null;

  function initiateAudit(){
    if(userRole!=="auditor") return;
    if(lastYearAudit) return;
    if(!window.confirm("Initiate audit for "+lastCalYear+"? Once approved by admin, all "+lastCalYear+" records will be permanently frozen.")) return;
    setData(function(p){return{...p,auditedPeriods:[...(p.auditedPeriods||[]),{year:lastCalYear,status:"pending",initiatedBy:"auditor",initiatedAt:TODAY.toISOString()}]};});
  }
  function approveAudit(year){
    if(!isAdmin) return;
    if(!window.confirm("Approve and FREEZE all records for "+year+"? This cannot be undone.")) return;
    setData(function(p){return{...p,auditedPeriods:(p.auditedPeriods||[]).map(function(a){return a.year===year&&a.status==="pending"?{...a,status:"approved",approvedBy:"admin",approvedAt:TODAY.toISOString()}:a;})};});
  }
  function rejectAudit(year){
    if(!isAdmin) return;
    if(!window.confirm("Reject audit request for "+year+"?")) return;
    setData(function(p){return{...p,auditedPeriods:(p.auditedPeriods||[]).filter(function(a){return!(a.year===year&&a.status==="pending");})};});
  }

  function getFilteredData(){
    const now = new Date();
    let startDate, endDate = new Date();
    let startYear, startMonth, endYear, endMonth;
    if(filter === "3m") {
      startDate = new Date(now.getFullYear(), now.getMonth()-2, 1);
      startYear = startDate.getFullYear(); startMonth = startDate.getMonth();
      endYear = now.getFullYear(); endMonth = now.getMonth();
    } else if(filter === "6m") {
      startDate = new Date(now.getFullYear(), now.getMonth()-5, 1);
      startYear = startDate.getFullYear(); startMonth = startDate.getMonth();
      endYear = now.getFullYear(); endMonth = now.getMonth();
    } else if(filter === "1y") {
      startDate = new Date(now.getFullYear()-1, now.getMonth(), 1);
      startYear = startDate.getFullYear(); startMonth = startDate.getMonth();
      endYear = now.getFullYear(); endMonth = now.getMonth();
    } else if(filter === "lastyear") {
      startDate = new Date(now.getFullYear()-1, 0, 1);
      endDate = new Date(now.getFullYear()-1, 11, 31);
      startYear = now.getFullYear()-1; startMonth = 0;
      endYear = now.getFullYear()-1; endMonth = 11;
    } else {
      const year = parseInt(filter);
      startDate = new Date(year, 0, 1); endDate = new Date(year, 11, 31);
      startYear = year; startMonth = 0; endYear = year; endMonth = 11;
    }
    let collections = 0;
    FLATS.forEach(f => {
      for(let y = startYear; y <= endYear; y++) {
        const mStart = (y === startYear) ? startMonth : 0;
        const mEnd = (y === endYear) ? endMonth : 11;
        for(let m = mStart; m <= mEnd; m++) {
          const c = (data.collections[f] && data.collections[f][y+"-"+m]) || {amount: 5000, paid: false, advance: false};
          if(c.paid && !c.advance) collections += c.amount;
        }
      }
    });
    if(data.specialCollections) {
      data.specialCollections.forEach(sc => {
        sc.entries.forEach(e => {
          if(e.paid && e.paidDate) {
            const d = new Date(e.paidDate);
            const y = d.getFullYear(); const m = d.getMonth();
            if(y >= startYear && y <= endYear && (y !== startYear || m >= startMonth) && (y !== endYear || m <= endMonth)) {
              collections += parseFloat(e.amount || 0);
            }
          }
        });
      });
    }
    const expenses = data.expenses.filter(e => {
      return e.year >= startYear && e.year <= endYear && (e.year !== startYear || e.month >= startMonth) && (e.year !== endYear || e.month <= endMonth);
    }).reduce((s, e) => s + e.amount, 0);
    let carryForward = 142799;
    const previousMonths = [];
    for(let y = START_YEAR; y < startYear; y++) { for(let m = 0; m < 12; m++) { previousMonths.push({year: y, month: m}); } }
    for(let m = 0; m < startMonth; m++) { previousMonths.push({year: startYear, month: m}); }
    previousMonths.forEach(({year: y, month: m}) => {
      let maint = 0;
      FLATS.forEach(f => { const c = (data.collections[f] && data.collections[f][y+"-"+m]) || {amount: 5000, paid: false, advance: false}; if(c.paid && !c.advance) maint += c.amount; });
      const special = data.specialCollections ? data.specialCollections.reduce((sum, sc) => { return sum + sc.entries.filter(e => e.paid && e.paidDate && new Date(e.paidDate).getFullYear() === y && new Date(e.paidDate).getMonth() === m).reduce((s, e) => s + parseFloat(e.amount || 0), 0); }, 0) : 0;
      const exp = data.expenses.filter(e => e.year === y && e.month === m).reduce((s, e) => s + e.amount, 0);
      carryForward += (maint + special - exp);
    });
    let dues = 0;
    FLATS.forEach(f => { const p = getFlatPending(f); dues += p.overdue; });
    const netBalance = carryForward + collections - expenses;
    return { collections, expenses, dues, carryForward, netBalance, startDate: fmtIndian(startDate.toISOString().split("T")[0]), endDate: fmtIndian(endDate.toISOString().split("T")[0]) };
  }
  function getFlatPending(flat){
    let overdue = 0;
    YEARS.forEach(y => MONTHS.forEach((_, m) => {
      const c = (data.collections[flat] && data.collections[flat][y+"-"+m]) || {amount: 5000, paid: false};
      if(!c.paid && isPast(y, m)) overdue += c.amount;
    }));
    return { overdue };
  }

  const auditData = getFilteredData();
  const net = auditData.netBalance;
  const filterOpts = [["1y", "Last 1 Year"], ["6m", "Last 6 Months"], ["3m", "Last 3 Months"], ["lastyear", "Last Calendar Year"], ...YEARS.map(y => [String(y), String(y)])];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6">
        <button onClick={() => setView("dashboard")} className="text-indigo-100 hover:text-white mb-2 font-semibold text-sm">← Dashboard</button>
        <h1 className="text-3xl font-bold">📋 Audit Report</h1>
      </header>
      <NavBar view="audit" setView={setView}/>
      <main className="max-w-7xl mx-auto px-6 py-8">

        <div className="bg-white rounded-lg shadow p-6 mb-6 border-l-4 border-indigo-500">
          <h3 className="font-bold text-lg mb-4">🔐 Audit Management</h3>
          {approvedAudits.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 mb-2">FROZEN YEARS (Approved Audits)</p>
              <div className="flex flex-wrap gap-2">
                {approvedAudits.map(function(a){ return (
                  <span key={a.year} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-full text-xs font-bold border border-indigo-300">
                    {"🔒 "+a.year+" — Frozen"}
                    {a.approvedAt && <span className="text-indigo-500 font-normal">{"· "+new Date(a.approvedAt).toLocaleDateString("en-IN")}</span>}
                  </span>
                ); })}
              </div>
            </div>
          )}
          {pendingAudit && (
            <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-yellow-800">{"⏳ Pending Audit — "+pendingAudit.year}</p>
                  <p className="text-xs text-yellow-700 mt-0.5">{"Initiated by Auditor on "+new Date(pendingAudit.initiatedAt||"").toLocaleDateString("en-IN")+". Awaiting Admin approval."}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={function(){approveAudit(pendingAudit.year);}} className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700">Approve and Freeze</button>
                    <button onClick={function(){rejectAudit(pendingAudit.year);}} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-600">Reject</button>
                  </div>
                )}
                {!isAdmin && <span className="text-xs text-yellow-600 font-semibold">Waiting for Admin approval</span>}
              </div>
            </div>
          )}
          {userRole === "auditor" && !lastYearAudit && !pendingAudit && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-800 mb-2">{"Ready to audit "+lastCalYear+" (last calendar year). Once admin approves, all "+lastCalYear+" records will be read-only."}</p>
              <button onClick={initiateAudit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">{"📋 Initiate Audit for "+lastCalYear}</button>
            </div>
          )}
          {userRole === "auditor" && lastYearAudit && lastYearAudit.status === "approved" && (
            <p className="text-sm text-green-700 font-semibold">{"✅ "+lastCalYear+" has been audited and frozen."}</p>
          )}
          {userRole !== "auditor" && !isAdmin && approvedAudits.length === 0 && !pendingAudit && (
            <p className="text-xs text-gray-400">No audits initiated yet. Only Auditors can initiate and Admins can approve.</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold mb-4">Select Period</h3>
          <div className="flex flex-wrap gap-2">
            {filterOpts.map(([val, lbl]) => (
              <button key={val} onClick={() => setFilter(val)} className={"px-4 py-2 rounded-lg text-sm font-bold transition " + (filter === val ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <p className="text-gray-500 text-xs font-bold mb-2">COLLECTIONS</p>
            <p className="text-3xl font-bold text-green-700">{"₹"+auditData.collections.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <p className="text-gray-500 text-xs font-bold mb-2">EXPENSES</p>
            <p className="text-3xl font-bold text-red-700">{"₹"+auditData.expenses.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500">
            <p className="text-gray-500 text-xs font-bold mb-2">OUTSTANDING DUES</p>
            <p className="text-3xl font-bold text-orange-700">{"₹"+auditData.dues.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
            <p className="text-gray-500 text-xs font-bold mb-2">OPENING BALANCE</p>
            <p className="text-3xl font-bold text-purple-700">{"₹"+auditData.carryForward.toLocaleString()}</p>
          </div>
          <div className={"bg-white rounded-lg shadow p-6 border-l-4 " + (net >= 0 ? "border-blue-500" : "border-red-500")}>
            <p className="text-gray-500 text-xs font-bold mb-2">NET BALANCE</p>
            <p className={"text-3xl font-bold " + (net >= 0 ? "text-blue-700" : "text-red-700")}>{"₹"+net.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-bold text-lg mb-4">{"Period: "+auditData.startDate+" to "+auditData.endDate}</h3>
          <div className="space-y-4">
            <div className="border-b pb-4">
              <p className="font-bold text-purple-700 mb-2">Opening Balance (Carry Forward)</p>
              <p className="text-2xl font-bold text-gray-800">{"₹"+auditData.carryForward.toLocaleString()}</p>
            </div>
            <div className="border-b pb-4">
              <p className="font-bold text-green-700 mb-2">Collections (Period)</p>
              <p className="text-2xl font-bold text-gray-800">{"+ ₹"+auditData.collections.toLocaleString()}</p>
            </div>
            <div className="border-b pb-4">
              <p className="font-bold text-red-700 mb-2">Expenses (Period)</p>
              <p className="text-2xl font-bold text-gray-800">{"- ₹"+auditData.expenses.toLocaleString()}</p>
            </div>
            <div className="border-b pb-4">
              <p className="font-bold text-orange-700 mb-2">Outstanding Dues</p>
              <p className="text-2xl font-bold text-gray-800">{"₹"+auditData.dues.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
              <p className="text-gray-600 text-sm mb-2">Closing Balance (Opening + Collections - Expenses)</p>
              <p className={"text-4xl font-bold "+(net >= 0 ? "text-green-700" : "text-red-700")}>{(net >= 0 ? "+" : "")+"₹"+net.toLocaleString()}</p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
function SpecialPage({data,setData,setView,navView,isAdmin}){
  const [showNew,setShowNew]=useState(false);
  const [selId,setSelId]=useState(null);
  const [nf,setNf]=useState({year:TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear(),month:TODAY.getMonth(),title:"",purpose:"",targetAmount:"",notes:""});

  function addCollection(){
    if(!nf.title.trim()) return;
    const sc={id:Date.now().toString(),...nf,targetAmount:parseFloat(nf.targetAmount)||0,
      entries:FLATS.map(f=>({flatNum:f,amount:0,paid:false,paidDate:"",method:"Cash",note:"",receivedFrom:"",receivedDate:TODAY.toISOString().split("T")[0]}))
    };
    setData(p=>({...p,specialCollections:[...(p.specialCollections||[]),sc]}));
    setShowNew(false);setSelId(sc.id);
    setNf({year:TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear(),month:TODAY.getMonth(),title:"",purpose:"",targetAmount:"",notes:""});
  }
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,specialCollections:(p.specialCollections||[]).filter(s=>s.id!==id)}));if(selId===id) setSelId(null);}
  function updEntry(scid,flatNum,upd){setData(p=>({...p,specialCollections:(p.specialCollections||[]).map(sc=>sc.id===scid?{...sc,entries:sc.entries.map(e=>e.flatNum===flatNum?{...e,...upd}:e)}:sc)}));}
  function updSc(scid,upd){setData(p=>({...p,specialCollections:(p.specialCollections||[]).map(sc=>sc.id===scid?{...sc,...upd}:sc)}));}

  const scs=data.specialCollections||[];
  const sel=selId?scs.find(s=>s.id===selId):null;

  if(sel){
    const paid=sel.entries.filter(e=>e.paid);
    const total=paid.reduce((s,e)=>s+parseFloat(e.amount||0),0);
    const pct=sel.targetAmount?Math.round(total/sel.targetAmount*100):0;
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6">
          <button onClick={()=>setSelId(null)} className="text-purple-100 hover:text-white mb-2 font-semibold text-sm">← All Special Collections</button>
          <h1 className="text-2xl font-bold">{sel.title}</h1>
        </header>
        <NavBar view={navView} setView={setView}/>
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-center mb-2"><h3 className="font-bold">Collection Progress</h3><span className="text-sm font-semibold text-gray-600">{paid.length}/{sel.entries.length} flats paid</span></div>
            {sel.targetAmount>0&&<><div className="flex justify-between text-xs text-gray-500 mb-1"><span>Collected: ₹{total.toLocaleString()}</span><span>Target: ₹{sel.targetAmount.toLocaleString()} ({pct}%)</span></div><div className="w-full bg-gray-200 rounded-full h-3 mb-3"><div className="bg-purple-500 h-3 rounded-full" style={{width:Math.min(pct,100)+"%"}}></div></div></>}
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Total Collected" value={"₹"+total.toLocaleString()} bg="bg-purple-50" borderColor="border-purple-500"/>
              <MetricCard label="Flats Paid" value={paid.length} bg="bg-green-50" borderColor="border-green-500"/>
              <MetricCard label="Pending" value={sel.entries.length-paid.length} bg="bg-orange-50" borderColor="border-orange-400"/>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-3 text-left">Flat</th><th className="px-3 py-3 text-left">Resident</th><th className="px-3 py-3 text-center">Amount (₹)</th><th className="px-3 py-3 text-center">Status</th><th className="px-3 py-3 text-left">Date</th><th className="px-3 py-3 text-left">Mode</th><th className="px-3 py-3 text-left">Note</th></tr></thead>
              <tbody>{sel.entries.map(e=>{const fd=data.flats[e.flatNum];const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;return(<tr key={e.flatNum} className={"border-t "+(e.paid?"bg-green-50":"hover:bg-gray-50")}><td className="px-3 py-2 font-bold text-blue-600">{e.flatNum}</td><td className="px-3 py-2 text-gray-600 text-xs">{name}</td><td className="px-3 py-2 text-center">{isAdmin?<input type="number" value={e.amount||""} onChange={ev=>updEntry(sel.id,e.flatNum,{amount:parseFloat(ev.target.value)||0})} className="w-20 px-2 py-1 border rounded text-sm text-center font-semibold"/>:<span className="font-semibold">₹{e.amount||0}</span>}</td><td className="px-3 py-2 text-center">{isAdmin?<button onClick={()=>updEntry(sel.id,e.flatNum,{paid:!e.paid,paidDate:!e.paid?TODAY.toISOString().split("T")[0]:""})} className={"px-3 py-1 rounded text-xs font-bold "+(e.paid?"bg-green-100 text-green-700":"bg-orange-100 text-orange-600")}>{e.paid?"✓ Paid":"Pending"}</button>:<span className={"px-2 py-1 rounded text-xs font-bold "+(e.paid?"bg-green-100 text-green-700":"bg-orange-100 text-orange-600")}>{e.paid?"✓ Paid":"Pending"}</span>}</td><td className="px-3 py-2 text-xs">{isAdmin?<input type="date" value={e.paidDate||""} onChange={ev=>updEntry(sel.id,e.flatNum,{paidDate:ev.target.value})} className="px-2 py-1 border rounded text-xs w-32"/>:e.paidDate||"—"}</td><td className="px-3 py-2">{isAdmin?<select value={e.method||"Cash"} onChange={ev=>updEntry(sel.id,e.flatNum,{method:ev.target.value})} className="px-2 py-1 border rounded text-xs">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select>:<span className="text-xs">{e.method||"Cash"}</span>}</td><td className="px-3 py-2">{isAdmin?<input type="text" value={e.note||""} onChange={ev=>updEntry(sel.id,e.flatNum,{note:ev.target.value})} placeholder="Note..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs text-gray-500">{e.note||"—"}</span>}</td></tr>);})}</tbody>
              <tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={2} className="px-3 py-3 font-bold">Total</td><td className="px-3 py-3 text-center font-bold text-purple-700">₹{total.toLocaleString()}</td><td colSpan={4}></td></tr></tfoot>
            </table>
          </div>
        </main>
      </div>
    );
  }

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6"><h1 className="text-3xl font-bold">🎯 Special Collections</h1></header>
      <NavBar view={navView} setView={setView}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold text-sm"><Plus size={16}/> New Special Collection</button>}
        {showNew&&isAdmin&&(
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-purple-500">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Purpose</label><input type="text" value={nf.purpose} onChange={e=>setNf({...nf,purpose:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Target (₹)</label><input type="number" value={nf.targetAmount} onChange={e=>setNf({...nf,targetAmount:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-2"><button onClick={addCollection} className="px-5 py-2 bg-purple-600 text-white rounded-lg font-semibold text-sm hover:bg-purple-700">Create</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div>
          </div>
        )}
        {scs.length===0&&!showNew&&<div className="text-center py-16 text-gray-400"><p className="text-5xl mb-4">🎯</p><p>No special collections yet</p></div>}
        {scs.map(sc=>{
          const paid=sc.entries.filter(e=>e.paid);const total=paid.reduce((s,e)=>s+parseFloat(e.amount||0),0);
          return(
            <div key={sc.id} className="bg-white rounded-xl shadow hover:shadow-md transition overflow-hidden cursor-pointer" onClick={()=>setSelId(sc.id)}>
              <div className="p-5">
                <div className="flex justify-between items-start"><div><h3 className="font-bold text-gray-800">{sc.title}</h3><p className="text-xs text-gray-500 mt-0.5">{sc.purpose}</p></div>{isAdmin&&<button onClick={e=>{e.stopPropagation();del(sc.id);}} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={15}/></button>}</div>
                <div className="mt-3 flex gap-4 text-sm"><span className="font-bold text-purple-700">₹{total.toLocaleString()} collected</span><span className="text-gray-500">{paid.length}/{sc.entries.length} flats</span></div>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN EXPORT — AppContent receives isAdmin from Dashboard.jsx
// ══════════════════════════════════════════════════════════
export default function AppContent({ isAdmin, role = "admin" }) {
  // const [data,setData]                    = useState(initData);
  const [data, setData] = useState(initData);
const [dataLoaded, setDataLoaded] = useState(false);

// Load data from Firestore on mount
useEffect(() => {
  async function loadData() {
    try {
      const ref = doc(db, "apartmentData", "main");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setData(snap.data());
      }
    } catch (e) {
      console.error("Error loading data:", e);
    }
    setDataLoaded(true);
  }
  loadData();
}, []);

// Save data to Firestore whenever it changes
useEffect(() => {
  if (!dataLoaded) return;
  async function saveData() {
    try {
      const ref = doc(db, "apartmentData", "main");
      await setDoc(ref, data);
    } catch (e) {
      console.error("Error saving data:", e);
    }
  }
  saveData();
}, [data, dataLoaded]);
  const [currentMonth,setCurrentMonth]    = useState(TODAY.getMonth());
  const [currentYear,setCurrentYear]      = useState(TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear());
  const [view,setView]                    = useState("dashboard");
  const [selectedFlat,setSelectedFlat]    = useState(null);
  const [showAddExpense,setShowAddExpense] = useState(false);
  const [editingExpense,setEditingExpense] = useState(null);
  const [showBulkAdd,setShowBulkAdd]      = useState(false);
  const [bulkAmount,setBulkAmount]        = useState("");
  const [excludedFlats,setExcludedFlats]  = useState([]);
  const [selectedExpEntry,setSelectedExpEntry] = useState(null);
  const [newExpense,setNewExpense]         = useState({category:"Salary",subcategory:"Watchman Salary",amount:"",units:"",unitType:"monthly"});
  const [addingTenant,setAddingTenant]    = useState(false);
  const [draftTenant,setDraftTenant]      = useState(emptyTenant());
  const [showCatMgr,setShowCatMgr]        = useState(false);
  const [showCsvModal,setShowCsvModal]    = useState(false);
  const [showRecordPmt,setShowRecordPmt]  = useState(false);
  const [paymentFlat,setPaymentFlat]      = useState(null);
  const [expFilter,setExpFilter]          = useState("all");
  const [colView,setColView]              = useState("year");
  const [showAudit,setShowAudit] = useState(false);
const [auditFilter,setAuditFilter] = useState("1y");
  // const [data, setData] = useState(initData);


  function gc(flat,y,m){return(data.collections[flat]&&data.collections[flat][y+"-"+m])||{amount:5000,paid:false,advance:false};}
  // ── Role helpers ──────────────────────────────────────────
  const canViewPersonal = role==="admin";
  function isYearFrozen(year){return(data.auditedPeriods||[]).some(a=>a.year===year&&a.status==="approved");}
  const frozenYears=useMemo(()=>new Set((data.auditedPeriods||[]).filter(a=>a.status==="approved").map(a=>a.year)),[data.auditedPeriods]);
  function updateFlat(flat,upd){setData(p=>({...p,flats:{...p.flats,[flat]:{...p.flats[flat],...upd}}}));}
  function togglePayment(flat,y,m){if(!isAdmin||isYearFrozen(y)) return;setData(p=>{const key=y+"-"+m,col=p.collections[flat],cur=col[key]||{amount:5000,paid:false,advance:false};return{...p,collections:{...p.collections,[flat]:{...col,[key]:{...cur,paid:!cur.paid,advance:!cur.paid&&isFuture(y,m)}}}};});}
  function updateAmt(flat,y,m,amt){if(!isAdmin||isYearFrozen(y)) return;setData(p=>{const key=y+"-"+m,col=p.collections[flat];return{...p,collections:{...p.collections,[flat]:{...col,[key]:{...col[key]||{amount:5000,paid:false,advance:false},amount:parseFloat(amt)||0}}}};});}
  function getFlatStatus(flat){if(data.flats[flat].ownerOccupied) return "owner";if(data.flats[flat].currentTenant) return "tenant";return "vacant";}
  function getFlatPending(flat){
    let overdue=0,current=0,credit=0;
    YEARS.forEach(y=>MONTHS.forEach((_,m)=>{
      const c=gc(flat,y,m);
      if(c.paid&&c.advance){credit+=c.amount;return;}
      if(!c.paid){
        if(isPast(y,m)) overdue+=c.amount;
        else if(isCurrent(y,m)) current+=c.amount;
      }
    }));
    return{overdue,current,credit};
  }

  function getSpecialTotal(y,m){
    return (data.specialCollections||[]).reduce((sum,sc)=>{
      return sum+sc.entries.filter(e=>{
        if(!e.paid||!e.paidDate) return false;
        const d=new Date(e.paidDate);
        return d.getFullYear()===y&&d.getMonth()===m;
      }).reduce((s,e)=>s+parseFloat(e.amount||0),0);
    },0);
  }

  const pendingMetrics=useMemo(()=>{
    let to=0,tc=0;
    FLATS.forEach(f=>{YEARS.forEach(y=>MONTHS.forEach((_,m)=>{const c=gc(f,y,m);if(c.paid) return;if(isPast(y,m)) to+=c.amount;else if(isCurrent(y,m)) tc+=c.amount;}));});
    return{totalOverdue:to,totalCurrent:tc};
  },[data,currentYear,currentMonth]);

const carryForward = useMemo(() => {
  let bal = 142799;

  YEARS.forEach(y => MONTHS.forEach((_, m) => {
    if (y > currentYear || (y === currentYear && m >= currentMonth)) return;

    const maint = FLATS.reduce((s, f) => {
      const c = gc(f, y, m);
      return s + (c.paid && !c.advance ? c.amount : 0);
    }, 0);

    const special = getSpecialTotal(y, m);

    const exp = data.expenses
      .filter(e => e.year === y && e.month === m)
      .reduce((s, e) => s + e.amount, 0);

    bal += (maint + special - exp);
  }));

  return bal;

}, [data, currentMonth, currentYear]);

  function openRecordPmt(flat){if(!isAdmin) return;setPaymentFlat(flat);setShowRecordPmt(true);}
  function submitPayment(form){
    if(!form.amount||form.selectedMonths.length===0){alert("Enter amount and select months.");return;}
    setData(p=>{const col={...p.collections[paymentFlat]};form.selectedMonths.forEach(m=>{const cur=col[m.key]||{amount:5000,paid:false,advance:false};col[m.key]={...cur,paid:true,advance:isFuture(m.year,m.month),receivedDate:form.date,receivedMode:form.method,receivedFrom:form.receivedFrom};});const entry={id:Date.now().toString(),date:form.date,amount:parseFloat(form.amount),method:form.method,receivedFrom:form.receivedFrom,comments:form.comments,months:form.selectedMonths};return{...p,collections:{...p.collections,[paymentFlat]:col},paymentLedger:{...p.paymentLedger,[paymentFlat]:[...(p.paymentLedger[paymentFlat]||[]),entry]}};});
    setShowRecordPmt(false);setPaymentFlat(null);
  }
  function markOwnerOccupied(flat){if(!isAdmin) return;const t=data.flats[flat].currentTenant;const history=t?[...data.flats[flat].tenantHistory,{...t,moveOutDate:new Date().toISOString().split("T")[0]}]:data.flats[flat].tenantHistory;updateFlat(flat,{ownerOccupied:true,currentTenant:null,tenantHistory:history});}
  function markForRent(flat){if(!isAdmin) return;updateFlat(flat,{ownerOccupied:false,currentTenant:null});}
  function vacateFlat(flat){if(!isAdmin) return;const t=data.flats[flat].currentTenant;if(!t) return;updateFlat(flat,{currentTenant:null,tenantHistory:[...data.flats[flat].tenantHistory,{...t,moveOutDate:new Date().toISOString().split("T")[0]}]});}
  // NEW FUNCTION - Add after vacateFlat function (after line 715)
function markOwnerSold(flat){
  if(!isAdmin) return;
  const currentOwner = data.flats[flat];
  if(currentOwner.ownerOccupied === false && currentOwner.currentTenant === null) {
    alert("Flat is vacant. Please mark owner first before selling.");
    return;
  }
  
  // Save current owner to previousOwners list
  const ownerRecord = {
    name: currentOwner.ownerName,
    phone: currentOwner.ownerPhone,
    email: currentOwner.ownerEmail,
    altName: currentOwner.ownerAltName,
    altPhone: currentOwner.ownerAltPhone,
    altRelation: currentOwner.ownerAltRelation,
    stayingSince: currentOwner.ownerStayingSince,
    saleDate: new Date().toISOString().split("T")[0]
  };
  
  // Reset flat to empty state with new owner history
  updateFlat(flat, {
    previousOwners: [...(data.flats[flat].previousOwners || []), ownerRecord],
    ownerName: "Owner " + flat,
    ownerPhone: "9999999999",
    ownerEmail: "",
    ownerAltName: "",
    ownerAltPhone: "",
    ownerAltRelation: "",
    ownerStayingSince: "",
    ownerAdults: 1,
    ownerKids: 0,
    ownerOccupied: false,
    currentTenant: null,
    tenantHistory: []
  });
}
  function saveTenant(flat){if(!isAdmin) return;if(!draftTenant.name.trim()){alert("Enter tenant name");return;}updateFlat(flat,{currentTenant:{...draftTenant},ownerOccupied:false});setAddingTenant(false);}
  function updTenant(flat,f,v){if(!isAdmin) return;updateFlat(flat,{currentTenant:{...data.flats[flat].currentTenant,[f]:v}});}
  function deleteExpense(id){if(!isAdmin) return;const _de=data.expenses.find(e=>e.id===id);if(_de&&isYearFrozen(_de.year)) return;setData(p=>({...p,expenses:p.expenses.filter(e=>e.id!==id)}));}
  function addExpense(){
    if(!isAdmin||!newExpense.amount||!newExpense.category||!newExpense.subcategory||isYearFrozen(currentYear)) return;
    if(editingExpense){setData(p=>({...p,expenses:p.expenses.map(e=>e.id===editingExpense.id?{...e,...newExpense,year:currentYear,month:currentMonth,amount:parseFloat(newExpense.amount),units:parseFloat(newExpense.units)||0}:e)}));setEditingExpense(null);}
    else{setData(p=>({...p,expenses:[...p.expenses,{id:Date.now().toString(),year:currentYear,month:currentMonth,...newExpense,amount:parseFloat(newExpense.amount),units:parseFloat(newExpense.units)||0}]}));}
    setNewExpense({category:"Salary",subcategory:"Watchman Salary",amount:"",units:"",unitType:"monthly"});setShowAddExpense(false);
  }
  function bulkAdd(){if(!isAdmin||!bulkAmount) return;const amt=parseFloat(bulkAmount),key=currentYear+"-"+currentMonth;setData(p=>{const upd={};FLATS.filter(f=>!excludedFlats.includes(f)).forEach(f=>{upd[f]={...p.collections[f],[key]:{amount:amt,paid:true,advance:false}};});return{...p,collections:{...p.collections,...upd}};});setBulkAmount("");setExcludedFlats([]);setShowBulkAdd(false);}
  function downloadData(){const uri="data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(data,null,2));const a=document.createElement("a");a.href=uri;a.download="apt-data-"+Date.now()+".json";document.body.appendChild(a);a.click();document.body.removeChild(a);}
  function onAddCat(n){if(!isAdmin) return;n=n.trim();if(!n||data.expenseCategories[n]) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[n]:[]}}));}
  function onDeleteCat(c){if(!isAdmin) return;if(!window.confirm("Delete "+c+"?")) return;setData(p=>{const e={...p.expenseCategories};delete e[c];return{...p,expenseCategories:e};});}
  function onRenameCat(o,n){if(!isAdmin) return;n=n.trim();if(!n||n===o) return;setData(p=>{const c={};Object.keys(p.expenseCategories).forEach(k=>{c[k===o?n:k]=p.expenseCategories[k];});return{...p,expenseCategories:c,expenses:p.expenses.map(e=>e.category===o?{...e,category:n}:e)};});}
  function onAddSub(c,n){if(!isAdmin) return;n=n.trim();if(!n||data.expenseCategories[c].includes(n)) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:[...p.expenseCategories[c],n]}}));}
  function onDeleteSub(c,s){if(!isAdmin) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:p.expenseCategories[c].filter(x=>x!==s)}}));}
  function onRenameSub(c,o,n){if(!isAdmin) return;n=n.trim();if(!n||n===o) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:p.expenseCategories[c].map(s=>s===o?n:s)},expenses:p.expenses.map(e=>(e.category===c&&e.subcategory===o)?{...e,subcategory:n}:e)}));}
  function onImport(preview){if(!isAdmin) return;setData(p=>{const nf={...p.flats};preview.forEach(({flatNum,occ,row})=>{const ex={...nf[flatNum]};ex.ownerName=row["owner_name"]||ex.ownerName;ex.ownerPhone=row["owner_phone"]||ex.ownerPhone;ex.ownerEmail=row["owner_email"]||ex.ownerEmail;if(occ==="owner"){ex.ownerOccupied=true;ex.currentTenant=null;}if(occ==="vacant"){ex.ownerOccupied=false;ex.currentTenant=null;}if(occ==="tenant"){ex.ownerOccupied=false;ex.currentTenant={name:row["tenant_name"]||"",phone:row["tenant_phone"]||"",email:row["tenant_email"]||"",moveInDate:parseDate(row["tenant_move_in_date"])||"",permanentAddress:row["tenant_permanent_address"]||"",adults:parseInt(row["tenant_adults"])||1,children:parseInt(row["tenant_children"])||0,idType:row["tenant_id_type"]||"",idNumber:row["tenant_id_number"]||"",emergencyContact:row["tenant_emergency_contact"]||"",emergencyRelation:row["tenant_emergency_relation"]||""};}nf[flatNum]=ex;});return{...p,flats:nf};});setShowCsvModal(false);alert("✅ Imported "+preview.length+" flats.");}

  const stats=useMemo(()=>{const owners=FLATS.filter(f=>data.flats[f].ownerOccupied).length;const tenants=FLATS.filter(f=>!data.flats[f].ownerOccupied&&data.flats[f].currentTenant).length;return{owners,tenants,vacant:FLATS.length-owners-tenants};},[data]);
  const metrics=useMemo(()=>{const maint=FLATS.reduce((s,n)=>{const c=gc(n,currentYear,currentMonth);return s+(c.paid&&!c.advance?c.amount:0);},0);const special=getSpecialTotal(currentYear,currentMonth);const collected=maint+special;const expenses=data.expenses.filter(e=>e.year===currentYear&&e.month===currentMonth).reduce((s,e)=>s+e.amount,0);return{maint,special,collected,expenses,balance:collected-expenses};},[data,currentMonth,currentYear]);

  function trendData(){const maxMonth=currentYear<TODAY.getFullYear()?11:currentYear===TODAY.getFullYear()?TODAY.getMonth():-1;if(maxMonth===-1) return [];return MONTHS.slice(0,maxMonth+1).map((m,i)=>({month:m,collected:FLATS.reduce((s,n)=>{const c=gc(n,currentYear,i);return s+(c.paid&&!c.advance?c.amount:0);},0)+getSpecialTotal(currentYear,i),expenses:data.expenses.filter(e=>e.year===currentYear&&e.month===i).reduce((s,e)=>s+e.amount,0)})).map(d=>({...d,balance:d.collected-d.expenses}));}
  function expBreakdown(){const bd={};data.expenses.filter(e=>e.year===currentYear&&e.month===currentMonth).forEach(e=>{bd[e.category]=(bd[e.category]||0)+e.amount;});return Object.entries(bd).map(([name,value])=>({name,value}));}
  function collectionRateData(){
    // "Expected" = sum of maintenance amounts for occupied flats only (owner or tenant).
    // Vacant flats have no expected dues so they are excluded from the denominator.
    return trendData().map((d,i)=>{
      const occupiedFlats=FLATS.filter(f=>getFlatStatus(f)!=="vacant");
      const totalPossible=occupiedFlats.reduce((s,f)=>{const c=gc(f,currentYear,i);return s+c.amount;},0);
      return{...d,rate:totalPossible>0?Math.round(d.collected/totalPossible*100):0};
    });
  }
  function topPendingFlats(){return FLATS.map(f=>{const p=getFlatPending(f);const fd=data.flats[f];const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;return{flat:"Flat "+f,name,pending:p.overdue+p.current};}).filter(f=>f.pending>0).sort((a,b)=>b.pending-a.pending).slice(0,8);}
  function yearlyExpBreakdown(){const bd={};data.expenses.filter(e=>e.year===currentYear).forEach(e=>{bd[e.category]=(bd[e.category]||0)+e.amount;});return Object.entries(bd).map(([name,value])=>({name,value}));}

  const ym={currentYear,setCurrentYear,currentMonth,setCurrentMonth};
  function cellClass(c,y,m){return c.paid?(c.advance?"bg-purple-100 text-purple-700":"bg-emerald-100 text-emerald-700"):(isPast(y,m)?"bg-red-100 text-red-600":isCurrent(y,m)?"bg-yellow-100 text-yellow-700":"bg-gray-100 text-gray-400");}
  function cellLabel(c,y,m){return c.paid?(c.advance?"ADV":"✓"):(isPast(y,m)?"✗":isCurrent(y,m)?"⏳":"—");}
  const tenantFields=[["Tenant Name","name","text"],["Phone","phone","text"],["Email","email","email"],["Move-in Date","moveInDate","date"],["Permanent Address","permanentAddress","text"],["Adults","adults","number"],["Children","children","number"],["ID Type","idType","text"],["ID Number","idNumber","text"],["Emergency Contact","emergencyContact","text"],["Relation","emergencyRelation","text"]];

  function getColDetail(flat){const c=gc(flat,currentYear,currentMonth);return{receivedDate:c.receivedDate||"",receivedFrom:c.receivedFrom||"",method:c.receivedMode||"Cash",note:c.note||""};}
  function updColDetail(flat,field,val){if(!isAdmin) return;setData(p=>{const key=currentYear+"-"+currentMonth;const col={...p.collections[flat]};const cur=col[key]||{amount:5000,paid:false,advance:false};const fieldMap={receivedDate:"receivedDate",receivedFrom:"receivedFrom",method:"receivedMode",note:"note"};col[key]={...cur,[fieldMap[field]]:val};return{...p,collections:{...p.collections,[flat]:col}};});}
  const monthPaidTotal=FLATS.reduce((s,f)=>{const c=gc(f,currentYear,currentMonth);return s+(c.paid&&!c.advance?c.amount:0);},0);
  const monthPaidCount=FLATS.filter(f=>{const c=gc(f,currentYear,currentMonth);return c.paid&&!c.advance;}).length;

  // ── Page routing ──────────────────────────────────────────
  if(view==="meetings") return <MeetingsPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin}/>;
  if (!dataLoaded) return (
  <div className="flex items-center justify-center h-screen bg-gray-100">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-600 font-semibold">Loading apartment data...</p>
    </div>
  </div>
);
if(view==="audit") return <AuditPage data={data} setData={setData} setView={setView} isAdmin={isAdmin} role={role}/>;
  if(view==="incidents") return <IncidentsPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin}/>;
  if(view==="watchman") return <WatchmanPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin}/>;
  if(view==="special") return <SpecialPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin}/>;

  if(view==="expenseDetail"&&selectedExpEntry){
    const allEntries=selectedExpEntry.mode==="cat"?data.expenses.filter(e=>e.category===selectedExpEntry.category):data.expenses.filter(e=>e.subcategory===selectedExpEntry.subcategory);
    return <ExpDetailView title={selectedExpEntry.mode==="cat"?selectedExpEntry.category:selectedExpEntry.subcategory} subtitle={selectedExpEntry.mode==="cat"?"Category Summary":"Item Summary"} allEntries={allEntries} onBack={()=>setView("expenses")} navView={view} setView={setView}/>;
  }

  if(view==="pendingCollections"){
    const grandTotal=FLATS.reduce((s,f)=>{const p=getFlatPending(f);return s+p.overdue+p.current;},0);
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6"><button onClick={()=>setView("dashboard")} className="text-orange-100 hover:text-white mb-2 font-semibold text-sm">← Dashboard</button><h1 className="text-3xl font-bold">⏳ Pending Collections</h1><p className="text-orange-100 mt-1">Outstanding: <span className="font-bold text-white text-xl">₹{grandTotal.toLocaleString()}</span></p></header>
        <main className="max-w-full px-4 py-6"><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{FLATS.map(flat=>{const p=getFlatPending(flat);const total=p.overdue+p.current;if(total===0) return null;const f=data.flats[flat];const name=f.currentTenant?f.currentTenant.name:f.ownerName;return(<div key={flat} onClick={()=>{setSelectedFlat(flat);setView("flatDetail");}} className="bg-white rounded-xl border-l-4 border-orange-400 shadow p-3 cursor-pointer hover:shadow-md transition"><p className="text-lg font-bold text-blue-600">{flat}</p><p className="text-xs text-gray-500 truncate">{name}</p><p className="text-sm font-bold text-orange-600 mt-1">₹{total.toLocaleString()}</p></div>);})}</div></main>
      </div>
    );
  }

  if(view==="filteredFlats"){
    const fs=selectedFlat;
    const list=FLATS.filter(f=>getFlatStatus(f)===fs);
    return <div className="min-h-screen bg-gray-50"><header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><button onClick={()=>setView("dashboard")} className="text-blue-100 hover:text-white mb-2 font-semibold text-sm">← Back</button><h1 className="text-3xl font-bold">{fs==="owner"?"Owner Occupied":fs==="tenant"?"Rented":"Vacant"} ({list.length})</h1></header><main className="max-w-7xl mx-auto px-6 py-8"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{list.map(flat=>{const f=data.flats[flat];const name=fs==="tenant"&&f.currentTenant?f.currentTenant.name:f.ownerName||"";return(<button key={flat} onClick={()=>{setSelectedFlat(flat);setView("flatDetail");}} className="p-4 bg-blue-600 text-white rounded-lg hover:shadow-lg transition text-left"><p className="text-2xl font-bold">{flat}</p>{name&&<p className="text-sm mt-1 opacity-90">{name}</p>}</button>);})}</div></main></div>;
  }

  if(view==="flatDetail"&&selectedFlat&&typeof selectedFlat==="number"){
    const flat=data.flats[selectedFlat];const tenant=flat.currentTenant;const status=getFlatStatus(selectedFlat);const ledger=data.paymentLedger[selectedFlat]||[];const pend=getFlatPending(selectedFlat);
    return(
      <div className="min-h-screen bg-gray-50">
        {showRecordPmt&&isAdmin&&<RecordPaymentModal paymentFlat={paymentFlat} flatData={data.flats[paymentFlat]} collections={data.collections} onClose={()=>setShowRecordPmt(false)} onSubmit={submitPayment} isAdmin={isAdmin}/>}
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <button onClick={()=>{setView("dashboard");setAddingTenant(false);}} className="text-blue-100 hover:text-white mb-2 font-semibold text-sm">← Back</button>
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><h1 className="text-3xl font-bold">Flat {selectedFlat}</h1><StatusBadge status={status}/></div>{isAdmin&&<button onClick={()=>openRecordPmt(selectedFlat)} className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 rounded-lg font-bold text-sm hover:bg-blue-50"><CreditCard size={16}/> Record Payment</button>}</div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          {(pend.overdue>0||pend.current>0)&&<div className="bg-orange-50 border border-orange-300 rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between"><div><p className="font-bold text-orange-700">⚠️ Outstanding Balance</p>{pend.overdue>0&&<p className="text-sm text-red-600">Overdue: <strong>₹{pend.overdue.toLocaleString()}</strong></p>}{pend.current>0&&<p className="text-sm text-yellow-700">Current: <strong>₹{pend.current.toLocaleString()}</strong></p>}</div>{isAdmin&&<button onClick={()=>openRecordPmt(selectedFlat)} className="px-4 py-2 bg-orange-500 text-white rounded-lg font-bold text-sm hover:bg-orange-600">💳 Collect</button>}</div>}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-5">👤 Owner Details</h2>
            {!canViewPersonal&&<div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3"><span className="text-3xl">🔒</span><div><p className="font-bold text-amber-800">Restricted — Admins Only</p><p className="text-xs text-amber-600 mt-0.5">Owner personal details are not visible to <span className="font-semibold capitalize">{role}</span> accounts</p></div></div>}
            {canViewPersonal&&<><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">{[["Full Name","ownerName","text"],["📞 Phone","ownerPhone","text"],["✉️ Email","ownerEmail","email"],["Alternate Contact","ownerAltName","text"],["Alt. Phone","ownerAltPhone","text"],["Relation","ownerAltRelation","text"],["📅 Staying Since","ownerStayingSince","date"],["👥 Adults","ownerAdults","number"],["👧 Kids","ownerKids","number"]].map(([label,field,type])=>(<div key={field} className="bg-gray-50 rounded-xl p-4 border"><p className="text-xs font-bold text-gray-400 uppercase mb-2">{label}</p>{isAdmin?<input type={type} value={flat[field]||""} onChange={e=>updateFlat(selectedFlat,{[field]:e.target.value})} className="w-full bg-transparent text-lg font-semibold text-gray-800 border-b border-gray-300 focus:border-blue-500 outline-none pb-1"/>:<p className="text-lg font-semibold text-gray-800">{flat[field]||"—"}</p>}</div>))}</div>
            {isAdmin&&(
  <div className="border-t pt-4"><p className="text-xs font-semibold text-gray-600 mb-3">OCCUPANCY</p><div className="flex gap-3"><button onClick={()=>markOwnerOccupied(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status==="owner"?"border-blue-600 bg-blue-600 text-white":"border-blue-300 text-blue-600 hover:bg-blue-50")}>🏠 Owner Stays</button><button onClick={()=>markForRent(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status!=="owner"?"border-green-600 bg-green-600 text-white":"border-green-300 text-green-600 hover:bg-green-50")}>🔑 Rented / Vacant</button><button onClick={()=>{if(window.confirm("Are you sure you want to mark this property as sold?")) markOwnerSold(selectedFlat);}} className="px-4 py-2 rounded-lg text-sm font-semibold border-2 border-red-300 text-red-600 hover:bg-red-50">💼 Owner Sold</button></div></div>
)}
            {/* {isAdmin&&( */}
              {/* <div className="border-t pt-4"><p className="text-xs font-semibold text-gray-600 mb-3">OCCUPANCY</p><div className="flex gap-3"><button onClick={()=>markOwnerOccupied(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status==="owner"?"border-blue-600 bg-blue-600 text-white":"border-blue-300 text-blue-600 hover:bg-blue-50")}>🏠 Owner Stays</button><button onClick={()=>markForRent(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status!=="owner"?"border-green-600 bg-green-600 text-white":"border-green-300 text-green-600 hover:bg-green-50")}>🔑 Rented / Vacant</button></div></div> */}
            {/* )} */}
            </>}
          </div>
          {status!=="owner"&&(<div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">🧑‍💼 Tenant Details</h2>{isAdmin&&tenant&&!addingTenant&&canViewPersonal&&<button onClick={()=>{if(window.confirm("Are you sure you want to vacate this tenant?")) vacateFlat(selectedFlat);}} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-semibold">Vacate</button>}</div>
            {!canViewPersonal&&<div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3"><span className="text-3xl">🔒</span><div><p className="font-bold text-amber-800">Restricted — Admins Only</p><p className="text-xs text-amber-600 mt-0.5">Tenant personal details are not visible to <span className="font-semibold capitalize">{role}</span> accounts</p></div></div>}
            {canViewPersonal&&<>{!tenant&&!addingTenant&&<div className="text-center py-8 bg-gray-50 rounded-lg"><p className="text-4xl mb-3">🏚️</p><p className="text-gray-500 mb-4">Flat is vacant</p>{isAdmin&&<button onClick={()=>{setDraftTenant(emptyTenant());setAddingTenant(true);}} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">+ Add Tenant</button>}</div>}
            {addingTenant&&isAdmin&&<div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{tenantFields.map(([label,field,type])=>(<div key={field}><label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label><input type={type} value={draftTenant[field]||""} onChange={e=>setDraftTenant({...draftTenant,[field]:type==="number"?parseInt(e.target.value)||0:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>))}</div><div className="flex gap-3"><button onClick={()=>saveTenant(selectedFlat)} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm">✓ Save</button><button onClick={()=>setAddingTenant(false)} className="px-6 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>}
            {tenant&&!addingTenant&&<div className="grid grid-cols-1 md:grid-cols-2 gap-4">{tenantFields.map(([label,field,type])=>(<div key={field}><label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>{isAdmin?<input type={type} value={tenant[field]||""} onChange={e=>updTenant(selectedFlat,field,type==="number"?parseInt(e.target.value)||0:e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>:<p className="px-3 py-2 bg-gray-50 border rounded-lg text-sm">{tenant[field]||"—"}</p>}</div>))}</div>}
            </>}
          </div>)}
          {/* History Section */}
          {(flat.previousOwners?.length > 0 || flat.tenantHistory?.length > 0) && (
  <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
    <h2 className="text-xl font-bold mb-5">📜 History</h2>
    {!canViewPersonal&&<div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3"><span className="text-3xl">🔒</span><div><p className="font-bold text-amber-800">Restricted — Admins Only</p><p className="text-xs text-amber-600 mt-0.5">Owner and tenant history is not visible to <span className="font-semibold capitalize">{role}</span> accounts</p></div></div>}
    {canViewPersonal&&<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {flat.previousOwners?.length > 0 && (
        <div>
          <h3 className="font-bold text-purple-700 mb-3">Previous Owners</h3>
          <div className="space-y-3">
            {flat.previousOwners.map((owner, idx) => (
              <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="font-semibold text-gray-800">{owner.name}</p>
                <div className="text-xs text-gray-600 space-y-1 mt-2 border-t pt-2">
                  {owner.phone && <p>📞 <span className="font-medium">{owner.phone}</span></p>}
                  {owner.email && <p>✉️ <span className="font-medium">{owner.email}</span></p>}
                  {owner.altName && <p>👤 Alt: <span className="font-medium">{owner.altName}</span></p>}
                  {owner.altPhone && <p>📱 Alt Phone: <span className="font-medium">{owner.altPhone}</span></p>}
                  {owner.altRelation && <p>👥 Relation: <span className="font-medium">{owner.altRelation}</span></p>}
                  {owner.stayingSince && <p>📅 Stayed Since: <span className="font-medium">{fmtIndian(owner.stayingSince)}</span></p>}
                  {owner.saleDate && <p className="text-purple-600 font-semibold">💼 Sold: {fmtIndian(owner.saleDate)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {flat.tenantHistory?.length > 0 && (
        <div>
          <h3 className="font-bold text-green-700 mb-3">Past Tenants</h3>
          <div className="space-y-3">
            {flat.tenantHistory.map((tenant, idx) => (
              <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                <div>
                  <p className="font-semibold text-gray-800">{tenant.name}</p>
                  <div className="text-xs text-gray-600 space-y-1 mt-1 border-b pb-2">
                    {tenant.phone && <p>📞 <span className="font-medium">{tenant.phone}</span></p>}
                    {tenant.email && <p>✉️ <span className="font-medium">{tenant.email}</span></p>}
                  </div>
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  {tenant.moveInDate && <p>📅 Moved In: <span className="font-medium">{fmtIndian(tenant.moveInDate)}</span></p>}
                  {tenant.moveOutDate && <p>🚪 Moved Out: <span className="font-medium text-red-600">{fmtIndian(tenant.moveOutDate)}</span></p>}
                </div>
                {(tenant.permanentAddress || tenant.adults || tenant.children) && (
                  <div className="text-xs text-gray-600 space-y-1 border-t pt-2">
                    {tenant.permanentAddress && <p>🏠 <span className="font-medium">{tenant.permanentAddress}</span></p>}
                    {(tenant.adults || tenant.children) && <p>👥 {tenant.adults || 0} Adults, {tenant.children || 0} Children</p>}
                  </div>
                )}
                {(tenant.emergencyContact || tenant.emergencyRelation) && (
                  <div className="text-xs text-red-600 space-y-1 border-t pt-2">
                    <p className="font-semibold">Emergency Contact</p>
                    {tenant.emergencyContact && <p>{tenant.emergencyContact}</p>}
                    {tenant.emergencyRelation && <p>({tenant.emergencyRelation})</p>}
                  </div>
                )}
                {(tenant.idType || tenant.idNumber) && (
                  <div className="text-xs text-gray-600 space-y-1 border-t pt-2">
                    <p className="font-semibold">ID Info</p>
                    {tenant.idType && <p>{tenant.idType}: <span className="font-medium">{tenant.idNumber || "—"}</span></p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>}
  </div>
)}
          {ledger.length>0&&<div className="bg-white rounded-lg shadow p-6"><h2 className="text-xl font-bold mb-4">📒 Payment Ledger</h2><div className="space-y-3">{ledger.slice().reverse().map(entry=>(<div key={entry.id} className="bg-green-50 border border-green-200 rounded-xl p-4"><div className="flex justify-between items-start"><p className="font-bold text-green-700">₹{entry.amount.toLocaleString()} received</p><p className="text-xs text-gray-400">{entry.months.length} month{entry.months.length>1?"s":""}</p></div><div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600">{entry.date&&<span>📅 {fmtIndian(entry.date)}</span>}{entry.method&&<span>💳 {entry.method}</span>}{entry.receivedFrom&&<span>👤 {entry.receivedFrom}</span>}</div><div className="flex flex-wrap gap-1.5 mt-2">{entry.months.map(m=><span key={m.key} className="px-2 py-0.5 bg-green-200 text-green-800 rounded-full text-xs font-semibold">{MONTHS[m.month]} {m.year}</span>)}</div></div>))}</div></div>}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">💰 Payment History</h2><div className="flex gap-2"><select value={currentYear} onChange={e=>setCurrentYear(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm font-semibold">{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>{isAdmin&&<button onClick={()=>openRecordPmt(selectedFlat)} className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"><CreditCard size={14}/> Record</button>}</div></div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-gray-50"><tr>{MONTHS.map((m,i)=><th key={i} className={"px-3 py-2 text-center font-semibold "+(isCurrent(currentYear,i)?"bg-yellow-50 text-yellow-700":"text-gray-600")}>{m}</th>)}</tr></thead><tbody><tr>{MONTHS.map((_,i)=>{const c=gc(selectedFlat,currentYear,i);return(<td key={i} className="px-1 py-3 text-center"><input type="number" value={c.amount} onChange={e=>updateAmt(selectedFlat,currentYear,i,e.target.value)} disabled={!isAdmin} className="w-16 px-1 py-1 text-center border rounded text-xs font-semibold mb-1 disabled:bg-gray-50"/><button onClick={()=>togglePayment(selectedFlat,currentYear,i)} disabled={!isAdmin} className={"w-full px-1 py-1 rounded text-xs font-bold "+cellClass(c,currentYear,i)+(isAdmin?" cursor-pointer hover:opacity-75":" cursor-default")}>{cellLabel(c,currentYear,i)}</button></td>);})}</tr></tbody></table></div>
          </div>
        </main>
      </div>
    );
  }

  // ── Expenses ──────────────────────────────────────────────
  if(view==="expenses"){
    const cats=data.expenseCategories;const subs=cats[newExpense.category]||[];
    const allExpenses=applyExpFilter(data.expenses,expFilter);
    const monthExpenses=data.expenses.filter(e=>e.year===currentYear&&e.month===currentMonth);
    return(
      <div className="min-h-screen bg-gray-50">
        {showCatMgr&&<CategoryManager cats={cats} onClose={()=>setShowCatMgr(false)} onAddCat={onAddCat} onDeleteCat={onDeleteCat} onRenameCat={onRenameCat} onAddSub={onAddSub} onDeleteSub={onDeleteSub} onRenameSub={onRenameSub} isAdmin={isAdmin}/>}
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><h1 className="text-3xl font-bold">Expense Tracker</h1></header>
        <NavBar view={view} setView={setView}/>
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <ExpFilterBar filter={expFilter} setFilter={setExpFilter} entries={data.expenses}/>
          <div className="grid grid-cols-3 gap-4"><MetricCard label="Total (filtered)" value={"₹"+allExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400"/><MetricCard label={MONTHS[currentMonth]+" "+currentYear} value={"₹"+monthExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()} bg="bg-red-50" borderColor="border-red-400"/><MetricCard label="Entries (filtered)" value={allExpenses.length} bg="bg-purple-50" borderColor="border-purple-400"/></div>
          <div className="flex justify-between items-center flex-wrap gap-3"><YMSel {...ym}/><div className="flex gap-2">{isAdmin&&<><button onClick={()=>setShowCatMgr(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold text-sm"><Settings size={15}/> Categories</button><button onClick={()=>{setEditingExpense(null);setNewExpense({category:Object.keys(cats)[0]||"",subcategory:(Object.values(cats)[0]||[])[0]||"",amount:"",units:"",unitType:"monthly"});setShowAddExpense(!showAddExpense);}} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"><Plus size={16}/> Add Expense</button></>}</div></div>
          {showAddExpense&&isAdmin&&(<div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500"><h3 className="font-bold mb-4">{editingExpense?"Edit":"New"} Expense — {MONTHS[currentMonth]} {currentYear}</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Category</label><select value={newExpense.category} onChange={e=>{const c=e.target.value;setNewExpense({...newExpense,category:c,subcategory:(cats[c]||[])[0]||""});}} className="w-full px-3 py-2 border rounded-lg text-sm">{Object.keys(cats).map(c=><option key={c}>{c}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Sub-Category</label><select value={newExpense.subcategory} onChange={e=>setNewExpense({...newExpense,subcategory:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{subs.map(s=><option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹)</label><input type="number" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Units</label><input type="number" value={newExpense.units} onChange={e=>setNewExpense({...newExpense,units:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Unit Type</label><input type="text" value={newExpense.unitType} onChange={e=>setNewExpense({...newExpense,unitType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div></div><div className="flex gap-2"><button onClick={addExpense} className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm">Save</button><button onClick={()=>{setShowAddExpense(false);setEditingExpense(null);}} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>)}

          {/* ── Expense Analytics Charts (responds to filter bar above) ── */}
          {allExpenses.length>0&&(()=>{
            // Monthly spend trend
            const monthlyMap={};
            allExpenses.forEach(e=>{const k=e.year+"-"+String(e.month).padStart(2,"0");monthlyMap[k]=(monthlyMap[k]||0)+e.amount;});
            const monthlyTrend=Object.entries(monthlyMap).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>{const[y,m]=k.split("-");return{label:MONTHS[parseInt(m)]+" '"+y.slice(2),amount:v};});
            // Category breakdown
            const catMap={};allExpenses.forEach(e=>{catMap[e.category]=(catMap[e.category]||0)+e.amount;});
            const catData=Object.entries(catMap).sort(([,a],[,b])=>b-a).map(([name,value])=>({name,value}));
            // Sub-item breakdown (top 8)
            const subMap={};allExpenses.forEach(e=>{subMap[e.subcategory]=(subMap[e.subcategory]||0)+e.amount;});
            const subData=Object.entries(subMap).sort(([,a],[,b])=>b-a).slice(0,8).map(([name,value])=>({name,value}));
            const total=allExpenses.reduce((s,e)=>s+e.amount,0);
            return(
              <div className="space-y-4">
                {/* Row 1 — Monthly Trend */}
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold">📅 Monthly Expenditure Trend</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Filter: {expFilter==="all"?"All Time":expFilter==="3m"?"Last 3M":expFilter==="6m"?"Last 6M":expFilter==="1y"?"Last 1Y":expFilter==="lastyear"?"Last Cal. Year":expFilter}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Which months had the highest spend</p>
                  {monthlyTrend.length===1
                    ?<div className="flex items-center gap-4 py-4"><div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-400"><p className="text-xs text-gray-500">Single month selected</p><p className="text-2xl font-bold text-orange-700">₹{monthlyTrend[0].amount.toLocaleString()}</p><p className="text-sm text-gray-600">{monthlyTrend[0].label}</p></div></div>
                    :<ResponsiveContainer width="100%" height={180}><BarChart data={monthlyTrend} margin={{left:10,right:10}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label" tick={{fontSize:10}} angle={monthlyTrend.length>6?-30:0} textAnchor={monthlyTrend.length>6?"end":"middle"} height={monthlyTrend.length>6?50:30}/><YAxis tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><Tooltip formatter={v=>["₹"+v.toLocaleString(),"Expenses"]}/><Bar dataKey="amount" radius={[3,3,0,0]}>{monthlyTrend.map((d,i)=>{const max=Math.max(...monthlyTrend.map(x=>x.amount));return <Cell key={i} fill={d.amount===max?"#ef4444":"#f97316"}/>;})}</Bar></BarChart></ResponsiveContainer>}
                </div>
                {/* Row 2 — Category + Sub-item side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Driving Categories */}
                  <div className="bg-white rounded-lg shadow p-5">
                    <h3 className="font-bold mb-1">🏷️ What's Driving Expenses</h3>
                    <p className="text-xs text-gray-400 mb-3">Categories ranked by total spend in selected period</p>
                    <ResponsiveContainer width="100%" height={200}><BarChart data={catData} layout="vertical" margin={{left:0,right:30}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><YAxis type="category" dataKey="name" tick={{fontSize:10}} width={130}/><Tooltip formatter={v=>["₹"+v.toLocaleString(),"Total"]} labelFormatter={(_,p)=>p?.[0]?.payload?.name||""}/><Bar dataKey="value" radius={[0,3,3,0]}>{catData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>
                    <div className="mt-3 space-y-1">{catData.map((d,i)=><div key={i} className="flex justify-between items-center text-xs"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background:COLORS[i%COLORS.length]}}></div><span className="text-gray-700 truncate max-w-[160px]">{d.name}</span></div><span className="font-semibold text-gray-800">{Math.round(d.value/total*100)}%</span></div>)}</div>
                  </div>
                  {/* Top Sub-items */}
                  <div className="bg-white rounded-lg shadow p-5">
                    <h3 className="font-bold mb-1">🔍 Top Expense Items</h3>
                    <p className="text-xs text-gray-400 mb-3">Individual line items by total spend (top 8)</p>
                    <ResponsiveContainer width="100%" height={200}><BarChart data={subData} layout="vertical" margin={{left:0,right:30}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><YAxis type="category" dataKey="name" tick={{fontSize:10}} width={130}/><Tooltip formatter={v=>["₹"+v.toLocaleString(),"Total"]} labelFormatter={(_,p)=>p?.[0]?.payload?.name||""}/><Bar dataKey="value" radius={[0,3,3,0]}>{subData.map((_,i)=><Cell key={i} fill={i===0?"#ef4444":i===1?"#f97316":i===2?"#f59e0b":"#6366f1"}/>)}</Bar></BarChart></ResponsiveContainer>
                    <div className="mt-3 space-y-1">{subData.map((d,i)=><div key={i} className="flex justify-between items-center text-xs"><span className="text-gray-700 truncate max-w-[180px]">{i===0?"🔴":i===1?"🟠":i===2?"🟡":"🔵"} {d.name}</span><span className="font-semibold text-gray-800">₹{d.value.toLocaleString()}</span></div>)}</div>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="bg-white rounded-lg shadow overflow-x-auto"><div className="px-5 py-3 border-b flex justify-between items-center"><h3 className="font-bold">{MONTHS[currentMonth]} {currentYear}</h3></div><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-left">Item</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Units</th>{isAdmin&&<th className="px-4 py-3 text-center">Actions</th>}</tr></thead><tbody>{monthExpenses.length===0&&<tr><td colSpan={5} className="text-center py-10 text-gray-400">No expenses for {MONTHS[currentMonth]} {currentYear}</td></tr>}{monthExpenses.map(e=>(<tr key={e.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3"><button onClick={()=>{setSelectedExpEntry({category:e.category,mode:"cat"});setView("expenseDetail");}} className="text-blue-600 font-semibold hover:underline text-left">{e.category}</button></td><td className="px-4 py-3"><button onClick={()=>{setSelectedExpEntry({category:e.category,subcategory:e.subcategory,mode:"item"});setView("expenseDetail");}} className="text-indigo-600 font-semibold hover:underline text-left">{e.subcategory}</button></td><td className="px-4 py-3 text-right">₹{e.amount.toLocaleString()}</td><td className="px-4 py-3 text-right text-gray-500">{e.units} {e.unitType}</td>{isAdmin&&<td className="px-4 py-3 text-center"><div className="flex gap-2 justify-center"><button onClick={()=>{setEditingExpense(e);setNewExpense({category:e.category,subcategory:e.subcategory,amount:e.amount.toString(),units:e.units.toString(),unitType:e.unitType});setShowAddExpense(true);}} className="text-blue-500 hover:text-blue-700"><Edit2 size={15}/></button><button onClick={()=>deleteExpense(e.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15}/></button></div></td>}</tr>))}</tbody>{monthExpenses.length>0&&<tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={2} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-right font-bold text-emerald-700">₹{monthExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()}</td><td colSpan={isAdmin?2:1}></td></tr></tfoot>}</table></div>
        </main>
      </div>
    );
  }

  // ── Collections ───────────────────────────────────────────
  if(view==="collections"){
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><h1 className="text-3xl font-bold">Collections Tracker</h1></header>
        <NavBar view={view} setView={setView}/>
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-3 items-center flex-wrap">
              <YMSel {...ym}/>
              {isAdmin&&colView==="year"&&<button onClick={()=>setShowBulkAdd(!showBulkAdd)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"><Plus size={16}/> Bulk Add</button>}
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setColView("year")} className={"px-4 py-2 rounded-lg text-xs font-bold border-2 transition "+(colView==="year"?"bg-blue-600 text-white border-blue-600":"border-blue-300 text-blue-600 hover:bg-blue-50")}>📅 Year Grid</button>
              <button onClick={()=>setColView("month")} className={"px-4 py-2 rounded-lg text-xs font-bold border-2 transition "+(colView==="month"?"bg-blue-600 text-white border-blue-600":"border-blue-300 text-blue-600 hover:bg-blue-50")}>📋 Month Detail</button>
            </div>
          </div>
          {showBulkAdd&&isAdmin&&colView==="year"&&(<div className="bg-blue-50 border border-blue-200 rounded-lg p-5"><h3 className="font-bold mb-3">Bulk Add — {MONTHS[currentMonth]} {currentYear}</h3><input type="number" value={bulkAmount} onChange={e=>setBulkAmount(e.target.value)} placeholder="Amount ₹" className="px-3 py-2 border rounded-lg text-sm mr-3"/><div className="flex flex-wrap gap-2 my-3">{FLATS.map(f=><button key={f} onClick={()=>setExcludedFlats(excludedFlats.includes(f)?excludedFlats.filter(x=>x!==f):[...excludedFlats,f])} className={"px-2 py-1 rounded text-xs font-bold "+(excludedFlats.includes(f)?"bg-red-200 text-red-700":"bg-green-100 text-green-700")}>{f}</button>)}</div><div className="flex gap-2"><button onClick={bulkAdd} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold text-sm">Apply to {FLATS.length-excludedFlats.length} flats</button><button onClick={()=>setShowBulkAdd(false)} className="px-4 py-2 bg-gray-400 text-white rounded font-semibold text-sm">Cancel</button></div></div>)}
          {colView==="year"&&(
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-xs"><thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left sticky left-0 bg-gray-50">Flat</th><th className="px-3 py-2 text-left">Status</th>{MONTHS.map((m,i)=><th key={i} className={"px-2 py-2 text-center "+(isCurrent(currentYear,i)?"bg-yellow-50":"")}>{m}<br/><span className="text-gray-400 font-normal">{currentYear}</span></th>)}</tr></thead>
              <tbody>{FLATS.map(flat=>(<tr key={flat} className="border-t hover:bg-gray-50"><td className="px-3 py-2 font-bold text-blue-600 cursor-pointer sticky left-0 bg-white hover:bg-blue-50" onClick={()=>{setSelectedFlat(flat);setAddingTenant(false);setView("flatDetail");}}>{flat}</td><td className="px-3 py-2"><StatusBadge status={getFlatStatus(flat)}/></td>{MONTHS.map((_,i)=>{const c=gc(flat,currentYear,i);return <td key={i} className="px-1 py-2 text-center"><div onClick={()=>togglePayment(flat,currentYear,i)} className={"text-xs font-bold rounded px-1 py-1 "+(isAdmin?"cursor-pointer hover:opacity-80":"")+cellClass(c,currentYear,i)}>₹{c.amount}</div></td>;})}
              </tr>))}</tbody></table>
            </div>
          )}
          {colView==="month"&&(
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-bold">{MONTHS[currentMonth]} {currentYear}</h3><p className="text-xs text-gray-500">{monthPaidCount}/{FLATS.length} paid · ₹{monthPaidTotal.toLocaleString()}</p></div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-blue-50"><tr><th className="px-4 py-3 text-left">Flat</th><th className="px-4 py-3 text-left">Resident</th><th className="px-4 py-3 text-center">Amount</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">From</th><th className="px-4 py-3 text-left">Mode</th><th className="px-4 py-3 text-left">Note</th></tr></thead>
              <tbody>{FLATS.map(flat=>{const c=gc(flat,currentYear,currentMonth);const fd=data.flats[flat];const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;const det=getColDetail(flat);const paid=c.paid&&!c.advance;return(<tr key={flat} className={"border-t "+(paid?"bg-green-50":"hover:bg-orange-50")}><td className="px-4 py-2 font-bold text-blue-600 cursor-pointer hover:underline" onClick={()=>{setSelectedFlat(flat);setView("flatDetail");}}>{flat}</td><td className="px-4 py-2 text-xs font-medium">{name}</td><td className="px-4 py-2 text-center">{isAdmin?<input type="number" value={c.amount} onChange={e=>updateAmt(flat,currentYear,currentMonth,e.target.value)} className="w-20 px-2 py-1 border rounded text-sm text-center font-semibold"/>:<span className="font-semibold">₹{c.amount}</span>}</td><td className="px-4 py-2 text-center"><button onClick={()=>isAdmin&&togglePayment(flat,currentYear,currentMonth)} disabled={!isAdmin} className={"px-3 py-1 rounded text-xs font-bold border "+(paid?"bg-green-100 text-green-700 border-green-300":c.advance?"bg-purple-100 text-purple-700 border-purple-300":"bg-orange-100 text-orange-600 border-orange-300")+(isAdmin?" cursor-pointer":" cursor-default")}>{c.paid?(c.advance?"⏫ Advance":"✓ Paid"):"⏳ Pending"}</button></td><td className="px-4 py-2">{isAdmin?<input type="date" value={det.receivedDate} onChange={e=>updColDetail(flat,"receivedDate",e.target.value)} className="px-2 py-1 border rounded text-xs w-32"/>:<span className="text-xs">{det.receivedDate||"—"}</span>}</td><td className="px-4 py-2">{isAdmin?<input type="text" value={det.receivedFrom} onChange={e=>updColDetail(flat,"receivedFrom",e.target.value)} placeholder="Name..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs">{det.receivedFrom||"—"}</span>}</td><td className="px-4 py-2">{isAdmin?<select value={det.method} onChange={e=>updColDetail(flat,"method",e.target.value)} className="px-2 py-1 border rounded text-xs">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select>:<span className="text-xs">{det.method}</span>}</td><td className="px-4 py-2">{isAdmin?<input type="text" value={det.note} onChange={e=>updColDetail(flat,"note",e.target.value)} placeholder="Note..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs text-gray-500">{det.note||"—"}</span>}</td></tr>);})}</tbody>
              <tfoot className="bg-blue-50 border-t-2"><tr><td colSpan={2} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-center font-bold">₹{monthPaidTotal.toLocaleString()}</td><td colSpan={5} className="px-4 py-3 text-xs text-gray-500">{monthPaidCount} flats paid</td></tr></tfoot>
              </table></div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────
  return(
    <div className="min-h-screen bg-gray-50">
      {showCsvModal&&<CsvModal onClose={()=>setShowCsvModal(false)} onImport={onImport} isAdmin={isAdmin}/>}
      {showRecordPmt&&paymentFlat&&isAdmin&&<RecordPaymentModal paymentFlat={paymentFlat} flatData={data.flats[paymentFlat]} collections={data.collections} onClose={()=>setShowRecordPmt(false)} onSubmit={submitPayment} isAdmin={isAdmin}/>}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><Home size={30}/><div><h1 className="text-2xl font-bold">{data.building.name}</h1><p className="text-blue-100 text-sm">{data.building.totalFlats} Flats</p></div></div>
          <div className="flex gap-2 flex-wrap justify-end">
            {isAdmin&&<button onClick={()=>setShowCsvModal(true)} className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold hover:bg-green-600"><Upload size={15}/> CSV</button>}
            <button onClick={downloadData} className="flex items-center gap-2 px-3 py-2 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50"><Download size={16}/> Export</button>
          </div>
        </div>
      </header>
      <NavBar view={view} setView={setView}/>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Flats" value={FLATS.length} bg="bg-blue-50"/>
          <MetricCard label="Owner Occupied" value={stats.owners} bg="bg-blue-50" onClick={()=>{setSelectedFlat("owner");setView("filteredFlats");}}/>
          <MetricCard label="Rented" value={stats.tenants} bg="bg-green-50" onClick={()=>{setSelectedFlat("tenant");setView("filteredFlats");}}/>
          <MetricCard label="Vacant" value={stats.vacant} bg="bg-red-50" onClick={()=>{setSelectedFlat("vacant");setView("filteredFlats");}}/>
        </div>
        <YMSel {...ym}/>
        {isYearFrozen(currentYear)&&<div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 text-sm font-semibold"><span>🔒</span><span>{currentYear} records are frozen (audit approved). No edits permitted.</span></div>}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard label="💰 Carry Forward" value={"₹"+carryForward.toLocaleString()} bg={carryForward>=0?"bg-teal-50":"bg-red-50"} borderColor={carryForward>=0?"border-teal-500":"border-red-500"}/>
          <MetricCard label="📥 Collected" value={"₹"+metrics.collected.toLocaleString()} sub={MONTHS[currentMonth]+" "+currentYear} bg="bg-emerald-50" borderColor="border-emerald-500"/>
          <MetricCard label="📤 Expenses" value={"₹"+metrics.expenses.toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400"/>
          <MetricCard label="📊 Net" value={"₹"+metrics.balance.toLocaleString()} bg={metrics.balance>=0?"bg-blue-50":"bg-red-50"} borderColor={metrics.balance>=0?"border-blue-500":"border-red-500"}/>
          <div onClick={()=>setView("pendingCollections")} className="bg-red-50 rounded-lg p-4 border-l-4 border-red-500 shadow cursor-pointer hover:shadow-md transition"><p className="text-gray-500 text-xs">⏳ Pending</p><p className="text-xl font-bold text-red-600">₹{(pendingMetrics.totalOverdue+pendingMetrics.totalCurrent).toLocaleString()}</p><p className="text-xs text-blue-500 mt-1 font-semibold">View →</p></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Collection vs Expense Trend — only actual months */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">📈 Collection vs Expense — {currentYear}</h3>
            <p className="text-xs text-gray-400 mb-3">{currentYear===TODAY.getFullYear()?"Jan – "+MONTHS[TODAY.getMonth()]+" (actuals only)":"Full Year"}</p>
            {trendData().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">No data for future year</p>
              :<ResponsiveContainer width="100%" height={200}><LineChart data={trendData()}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip formatter={v=>"₹"+v.toLocaleString()}/><Legend/><Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} name="Collected"/><Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses"/></LineChart></ResponsiveContainer>}
          </div>
          {/* Chart 2: Monthly Collection Rate % */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">✅ Collection Rate % — {currentYear}</h3>
            <p className="text-xs text-gray-400 mb-3">% of expected maintenance actually collected each month</p>
            {collectionRateData().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">No data for future year</p>
              :<ResponsiveContainer width="100%" height={200}><BarChart data={collectionRateData()}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} unit="%" domain={[0,100]}/><Tooltip formatter={v=>v+"%"}/><Bar dataKey="rate" radius={[3,3,0,0]} name="Collection Rate">{collectionRateData().map((d,i)=><Cell key={i} fill={d.rate>=90?"#10b981":d.rate>=60?"#f59e0b":"#ef4444"}/>)}</Bar></BarChart></ResponsiveContainer>}
          </div>
          {/* Chart 3: Top Outstanding Flats */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">⚠️ Top Pending Flats</h3>
            <p className="text-xs text-gray-400 mb-3">Flats with the highest outstanding dues (all time)</p>
            {topPendingFlats().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">🎉 All flats are clear!</p>
              :<ResponsiveContainer width="100%" height={200}><BarChart data={topPendingFlats()} layout="vertical" margin={{left:10,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><YAxis type="category" dataKey="flat" tick={{fontSize:11}} width={60}/><Tooltip formatter={v=>"₹"+v.toLocaleString()} labelFormatter={(_,payload)=>payload?.[0]?.payload?.name||""}/><Bar dataKey="pending" fill="#ef4444" radius={[0,3,3,0]} name="Pending"/></BarChart></ResponsiveContainer>}
          </div>
          {/* Chart 4: Yearly Expense Breakdown by Category */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">🥧 Expense Categories — {currentYear}</h3>
            <p className="text-xs text-gray-400 mb-3">Full-year expense split by category</p>
            {yearlyExpBreakdown().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">No expenses recorded for {currentYear}</p>
              :<ResponsiveContainer width="100%" height={200}><PieChart><Pie data={yearlyExpBreakdown()} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={p=>p.name.split(" ")[0]+" "+(p.percent*100).toFixed(0)+"%"}>{yearlyExpBreakdown().map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={v=>"₹"+v.toLocaleString()}/></PieChart></ResponsiveContainer>}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-5 border-b flex justify-between items-center"><h3 className="font-bold">Collections — {MONTHS[currentMonth]} {currentYear}</h3><button onClick={()=>setView("special")} className="text-xs text-purple-600 font-semibold hover:underline">🎯 Special Collections →</button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Flat</th><th className="px-4 py-3 text-left">Owner</th><th className="px-4 py-3 text-left">Occupant</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-center">Amount</th><th className="px-4 py-3 text-center">Payment</th><th className="px-4 py-3 text-center">Outstanding</th></tr></thead>
          <tbody>{FLATS.map(flat=>{const c=gc(flat,currentYear,currentMonth);const st=getFlatStatus(flat);const f=data.flats[flat];const p=getFlatPending(flat);const tot=p.overdue+p.current;return(<tr key={flat} className="border-t hover:bg-gray-50"><td className="px-4 py-3 font-bold text-blue-600 cursor-pointer hover:underline" onClick={()=>{setSelectedFlat(flat);setAddingTenant(false);setView("flatDetail");}}>{flat}</td><td className="px-4 py-3 text-gray-700 text-xs">{f.ownerName}</td><td className="px-4 py-3">{st==="owner"&&<span className="text-blue-600 font-semibold text-xs">{f.ownerName}</span>}{st==="tenant"&&<span className="text-green-600 text-xs">{f.currentTenant.name}</span>}{st==="vacant"&&<span className="text-red-400 text-xs">—</span>}</td><td className="px-4 py-3"><StatusBadge status={st}/></td><td className="px-4 py-3 text-center font-semibold">₹{c.amount}</td><td className="px-4 py-3 text-center"><button onClick={()=>togglePayment(flat,currentYear,currentMonth)} disabled={!isAdmin} className={"px-3 py-1 rounded text-xs font-bold "+cellClass(c,currentYear,currentMonth)+(isAdmin?" cursor-pointer hover:opacity-80":" cursor-default")}>{c.paid?(c.advance?"ADV":"✓ Paid"):"✗ Pending"}</button></td><td className="px-4 py-3 text-center">{tot>0?isAdmin?<button onClick={()=>openRecordPmt(flat)} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold hover:bg-orange-200">₹{tot.toLocaleString()}</button>:<span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">₹{tot.toLocaleString()}</span>:p.credit>0?<span className="px-2 py-1 bg-purple-100 text-purple-600 rounded text-xs font-bold">ADV ₹{p.credit.toLocaleString()}</span>:<span className="text-green-500 text-xs font-bold">✓ Clear</span>}</td></tr>);})}</tbody></table></div>
        </div>
      </main>
    </div>
  );
}
