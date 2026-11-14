import { useState, useMemo, useRef, useEffect } from "react";
import { doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Home, Plus, Trash2, Edit2, Download, Settings, Upload, CreditCard, ExternalLink, ChevronDown, ChevronUp, MessageSquare, Wrench, Phone, Mail, Tag } from "lucide-react";
import { LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, BarChart, Bar } from "recharts";
import ResidentDashboard from "./ResidentDashboard";
import PicsPage from "./PicsPage";

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
const MARK_PAID_MODES = ["Cash", "UPI", "Paid in advance", "Paid in next month"];
const PAYMENT_METHODS = ["Cash", "UPI", "Paid in advance", "Paid in next month"];

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

// ── EmailJS Helper (Uses your dedicated EmailJS Gmail service) ──
async function sendPortalEmail({ toEmail, toName, subject, messageBody }) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey || !window.emailjs) {
    return { ok: false, error: "EmailJS not configured" };
  }
  if (!toEmail || !toEmail.includes("@")) {
    return { ok: false, error: "No valid email address" };
  }
  try {
    await window.emailjs.send(
      serviceId,
      templateId,
      {
        to_email: toEmail,
        to_name: toName || "Resident",
        subject,
        message_body: messageBody,
      },
      { publicKey }
    );
    return { ok: true };
  } catch (err) {
    console.error("EmailJS send failed:", err);
    return { ok: false, error: err?.text || err?.message || "Send failed" };
  }
}

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
    auditedPeriods:[],
    managingCommittee:[],
    photoAlbums:[],
    watchman:{name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""},
    pastWatchmen:[]
  };
}

function NavBar({view,setView,role="admin"}){
  const adminItems=[
    ["dashboard","📊 Dashboard"],
    ["collections","💰 Collections"],
    ["special","🎯 Special"],
    ["expenses","📈 Expenses"],
    ["meetings","📋 Meetings"],
    ["watchman","👷 Watchman"],
    ["audit","📋 Audit"],
    ["reminders","📨 Reminders"],
    ["vendors","🔧 Vendors"],
    ["pics","📸 Pics"]
  ];
  const residentItems=[
    ["resident","🏠 My Flat Profile"],
    ["res_monthly","📅 Monthly Detail"],
    ["res_6m","📊 6-Month Summary"],
    ["res_year","📈 Year Audit"],
    ["meetings","📋 Meetings"],
    ["vendors","🔧 Vendors"],
    ["pics","📸 Pics"]
  ];
  const items=role==="resident"?residentItems:adminItems;
  return(
    <nav className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
        {items.map(([v,label])=>(
          <button key={v} onClick={()=>setView(v)} className={"px-3.5 py-3 border-b-2 font-semibold text-xs whitespace-nowrap "+(view===v?"border-blue-600 text-blue-600":"border-transparent text-gray-600 hover:text-gray-800")}>{label}</button>
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

// ── Mark Paid Confirmation Modal (Default 2500, 4 Payment Types, Owner/Watchman) ──
function ConfirmModal({title,message,subMessage,onConfirm,onCancel,confirmLabel="Confirm",confirmClass="bg-blue-600 hover:bg-blue-700",isMarkingPaid=false,ownerName="",defaultAmount=2500}){
  const [amount, setAmount] = useState(defaultAmount && defaultAmount > 0 ? defaultAmount : 2500);
  const [collectedDate, setCollectedDate] = useState(TODAY.toISOString().split("T")[0]);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [receivedFrom, setReceivedFrom] = useState(ownerName || "Flat Owner");

  return(
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center px-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e=>e.stopPropagation()}>
        <div className="text-center mb-3"><span className="text-4xl">{isMarkingPaid ? "💳" : "⚠️"}</span></div>
        <h2 className="text-lg font-bold text-gray-800 text-center mb-1">{title}</h2>
        <p className="text-sm font-semibold text-blue-600 text-center mb-1">{message}</p>
        {subMessage&&<p className="text-xs text-gray-400 text-center mb-4">{subMessage}</p>}

        {isMarkingPaid && (
          <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200 my-4 text-left">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e=>setAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-bold bg-white text-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Collected Date *</label>
                <input
                  type="date"
                  value={collectedDate}
                  onChange={e=>setCollectedDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-semibold bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Payment Type *</label>
              <select
                value={paymentMode}
                onChange={e=>setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm font-semibold bg-white"
              >
                {MARK_PAID_MODES.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Received From *</label>
              <select
                value={receivedFrom}
                onChange={e=>setReceivedFrom(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm font-semibold bg-white"
              >
                <option value={ownerName || "Flat Owner"}>{ownerName ? `${ownerName} (Flat Owner)` : "Flat Owner Name"}</option>
                <option value="Watchman">Watchman</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={()=>onConfirm({ amount: parseFloat(amount) || 2500, collectedDate, paymentMode, receivedFrom })}
            className={"flex-1 py-2.5 text-white rounded-xl font-bold text-sm "+confirmClass}
          >
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function NewNoticeAlert({data}){
  const [dismissed,setDismissed]=useState(false);
  const tenDaysAgo=new Date(Date.now()-10*24*60*60*1000);
  const recentMeetings=(data.meetings||[]).filter(m=>{
    const d=new Date(m.date||m.createdAt||"");
    return d>=tenDaysAgo;
  });
  const count=recentMeetings.length;
  if(count===0||dismissed) return null;
  return(
    <div className="fixed bottom-24 right-4 z-50">
      <button onClick={()=>setDismissed(true)} className="group relative flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-2.5 rounded-full shadow-2xl font-semibold text-sm animate-bounce hover:animate-none hover:shadow-indigo-300 transition-all">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-400"></span>
        </span>
        🔔 {count} new notice{count>1?"s":""} this week
        <span className="ml-1 text-gray-200 text-xs group-hover:text-white">✕</span>
      </button>
    </div>
  );
}

function CommitteeBanner({members,isAdmin,onUpdate}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(members||[]);
  const imgRef=useRef({});

  function addMember(){setDraft(d=>[...d,{id:Date.now().toString(),name:"",title:"",photo:""}]);}
  function removeMember(id){setDraft(d=>d.filter(m=>m.id!==id));}
  function updateMember(id,field,val){setDraft(d=>d.map(m=>m.id===id?{...m,[field]:val}:m));}
  function handlePhoto(id,file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>updateMember(id,"photo",e.target.result);
    reader.readAsDataURL(file);
  }
  function save(){onUpdate(draft);setEditing(false);}

  if((!members||members.length===0)&&!editing&&!isAdmin) return null;

  return(
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border-t border-slate-700">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-xs">★</span>
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">Managing Committee</h2>
            <span className="text-yellow-400 text-xs">★</span>
          </div>
          {isAdmin&&!editing&&<button onClick={()=>{setDraft(members||[]);setEditing(true);}} className="text-xs px-2 py-0.5 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-full text-slate-300 border border-slate-600 transition">✏️ Edit</button>}
        </div>

        {!editing&&(members&&members.length>0?(
          <div className="flex gap-5 overflow-x-auto pb-1 scrollbar-hide" style={{scrollbarWidth:"none"}}>
            {members.map(m=>(
              <div key={m.id} className="flex items-center gap-2.5 flex-shrink-0">
                <div className="w-10 h-10 rounded-full ring-2 ring-yellow-400 ring-offset-1 ring-offset-slate-800 overflow-hidden bg-slate-700 flex items-center justify-center shadow-md flex-shrink-0">
                  {m.photo?<img src={m.photo} alt={m.name} className="w-full h-full object-cover"/>:<span className="text-base font-bold text-white">{(m.name||"?")[0]?.toUpperCase()}</span>}
                </div>
                <div>
                  <p className="text-xs font-bold text-white leading-tight whitespace-nowrap">{m.name||"—"}</p>
                  <p className="text-xs text-yellow-400 font-medium whitespace-nowrap">{m.title||""}</p>
                </div>
              </div>
            ))}
          </div>
        ):(
          isAdmin&&<div className="text-center py-2"><button onClick={()=>{setDraft([]);setEditing(true);}} className="text-xs px-4 py-1.5 bg-yellow-500 text-gray-900 font-bold rounded-full hover:bg-yellow-400 transition">+ Add Committee Members</button></div>
        ))}

        {editing&&isAdmin&&(
          <div className="bg-white bg-opacity-5 rounded-xl p-4 border border-white border-opacity-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {draft.map(m=>(
                <div key={m.id} className="bg-white bg-opacity-10 rounded-xl p-3 flex gap-3 items-start">
                  <div className="flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-blue-700 flex items-center justify-center ring-2 ring-yellow-400 cursor-pointer" onClick={()=>imgRef.current[m.id]?.click()}>
                      {m.photo?<img src={m.photo} alt="" className="w-full h-full object-cover"/>:<span className="text-xl font-bold text-white">{(m.name||"?")[0]?.toUpperCase()}</span>}
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={el=>imgRef.current[m.id]=el} onChange={e=>handlePhoto(m.id,e.target.files[0])}/>
                    <button onClick={()=>imgRef.current[m.id]?.click()} className="text-xs text-blue-300 mt-1 hover:text-white w-full text-center">📷 Photo</button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <input type="text" value={m.name} onChange={e=>updateMember(m.id,"name",e.target.value)} placeholder="Full Name *" className="w-full px-2 py-1.5 rounded-lg text-gray-800 text-sm font-semibold"/>
                    <input type="text" value={m.title} onChange={e=>updateMember(m.id,"title",e.target.value)} placeholder="Title (e.g. President)" className="w-full px-2 py-1.5 rounded-lg text-gray-800 text-sm"/>
                    <button onClick={()=>removeMember(m.id)} className="text-xs text-red-300 hover:text-red-100">✕ Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={addMember} className="px-4 py-2 bg-yellow-500 text-gray-900 font-bold rounded-lg text-sm hover:bg-yellow-400">+ Add Member</button>
              <button onClick={save} className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg text-sm hover:bg-green-400">✓ Save</button>
              <button onClick={()=>setEditing(false)} className="px-4 py-2 bg-white bg-opacity-10 text-white rounded-lg text-sm hover:bg-opacity-20">Cancel</button>
            </div>
          </div>
        )}
      </div>
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
  if(status==="owner") return <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Owner</span>;
  if(status==="tenant") return <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">Tenant</span>;
  return <span className="px-2.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">Vacant</span>;
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
  const [form,setForm]=useState({date:TODAY.toISOString().split("T")[0],amount:"2500",method:"Cash",receivedFrom:flatData.ownerName || "Flat Owner",comments:"",selectedMonths:[]});
  function getCol(y,m){return(collections[paymentFlat]&&collections[paymentFlat][y+"-"+m])||{amount:2500,paid:false,advance:false};}
  const unpaid=[];
  YEARS.forEach(y=>MONTHS.forEach((_,m)=>{const c=getCol(y,m);if(!c.paid) unpaid.push({year:y,month:m,key:y+"-"+m,amount:c.amount||2500,future:isFuture(y,m)});}));
  const shown=unpaid.slice(0,36);
  function toggleMonth(key,year,month){setForm(f=>{const ex=f.selectedMonths.find(s=>s.key===key);return{...f,selectedMonths:ex?f.selectedMonths.filter(s=>s.key!==key):[...f.selectedMonths,{key,year,month}]};});}
  const selTotal=form.selectedMonths.reduce((s,m)=>s+(getCol(m.year,m.month).amount||2500),0);
  const diff=parseFloat(form.amount||0)-selTotal;
  const name=flatData.currentTenant?`${flatData.ownerName} (Tenant: ${flatData.currentTenant.name})`:flatData.ownerName;
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
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Amount (₹) *</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} disabled={!isAdmin} placeholder="2500" className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"/></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Payment Type</label><select value={form.method} onChange={e=>setForm({...form,method:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm">{MARK_PAID_MODES.map(m=><option key={m}>{m}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Received From</label><select value={form.receivedFrom} onChange={e=>setForm({...form,receivedFrom:e.target.value})} disabled={!isAdmin} className="w-full px-3 py-2 border rounded-lg text-sm"><option value={flatData.ownerName || "Flat Owner"}>{flatData.ownerName ? `${flatData.ownerName} (Flat Owner)` : "Flat Owner Name"}</option><option value="Watchman">Watchman</option></select></div>
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

function RemindersPage({ data, setData, setView, isAdmin, role }) {
  const [sendingId, setSendingId] = useState(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [sentStatus, setSentStatus] = useState({});
  const [paymentDetails, setPaymentDetails] = useState(
    data.building?.paymentInstructions ||
      "UPI ID: gmjelaniheights@upi\nAccount Name: GM Jelani Heights Association\nPlease share screenshot after transfer."
  );

  function savePaymentDetails() {
    setData((p) => ({
      ...p,
      building: { ...p.building, paymentInstructions: paymentDetails },
    }));
    alert("✓ Payment instructions saved!");
  }

  const pendingFlats = FLATS.map((flat) => {
    const fd = data.flats[flat];
    const overdueMonths = [];
    let totalDue = 0;
    YEARS.forEach((y) =>
      MONTHS.forEach((_, m) => {
        const c = (data.collections?.[flat] && data.collections[flat][y + "-" + m]) || { amount: 2500, paid: false };
        if (!c.paid && (isPast(y, m) || isCurrent(y, m))) {
          overdueMonths.push(`${MONTHS[m]} ${y}`);
          totalDue += c.amount || 2500;
        }
      })
    );
    const email = fd.currentTenant?.email || fd.ownerEmail || "";
    const name = fd.currentTenant?.name || fd.ownerName || `Flat ${flat}`;
    return { flat, name, email, overdueMonths, totalDue };
  }).filter((item) => item.totalDue > 0);

  async function sendOne(item) {
    if (!item.email) return alert(`No email saved for Flat ${item.flat}. Add an email in Flat Details first.`);
    setSendingId(item.flat);
    const res = await sendPortalEmail({
      toEmail: item.email,
      toName: item.name,
      subject: `Maintenance Payment Reminder — Flat ${item.flat} (₹${item.totalDue.toLocaleString("en-IN")} Due)`,
      messageBody: `This is a friendly reminder that your maintenance payment for Flat ${item.flat} is pending.\n\n• Pending Months: ${item.overdueMonths.join(", ")}\n• Total Amount Due: ₹${item.totalDue.toLocaleString("en-IN")}\n\nPayment Details:\n${paymentDetails}\n\nKindly clear the dues at your earliest convenience.`,
    });
    setSentStatus((prev) => ({ ...prev, [item.flat]: res.ok ? "sent" : res.error }));
    setSendingId(null);
  }

  async function sendAll() {
    const withEmail = pendingFlats.filter((p) => p.email);
    if (withEmail.length === 0) return alert("None of the pending flats have an email address saved.");
    if (!window.confirm(`Send reminder emails to ${withEmail.length} pending flats?`)) return;
    setBulkSending(true);
    for (const item of withEmail) {
      await sendOne(item);
    }
    setBulkSending(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">📨 Maintenance Payment Reminders</h1>
            <p className="text-amber-100 text-sm mt-1">{pendingFlats.length} flats currently have pending dues</p>
          </div>
          {isAdmin && pendingFlats.length > 0 && (
            <button
              onClick={sendAll}
              disabled={bulkSending}
              className="px-4 py-2 bg-white text-orange-700 rounded-xl font-bold text-sm hover:bg-orange-50 shadow disabled:opacity-50"
            >
              {bulkSending ? "Sending All..." : "📤 Send All Pending Reminders"}
            </button>
          )}
        </div>
      </header>
      <NavBar view="reminders" setView={setView} role={role} />
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-amber-500">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800 text-sm">💳 Payment Instructions (Included in Reminder Emails)</h3>
            {isAdmin && (
              <button onClick={savePaymentDetails} className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700">
                Save Details
              </button>
            )}
          </div>
          <textarea
            rows={3}
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border rounded-lg text-xs font-mono bg-gray-50"
          />
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Flat</th>
                <th className="px-4 py-3 text-left">Resident / Email</th>
                <th className="px-4 py-3 text-left">Pending Months</th>
                <th className="px-4 py-3 text-right">Total Due</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingFlats.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">🎉 All flats are paid up!</td></tr>
              )}
              {pendingFlats.map((item) => (
                <tr key={item.flat} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-blue-600">Flat {item.flat}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.email || <span className="text-red-500 font-semibold">No email saved</span>}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{item.overdueMonths.join(", ")}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">₹{item.totalDue.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-center">
                    {sentStatus[item.flat] === "sent" ? (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">✓ Sent</span>
                    ) : (
                      <button
                        onClick={() => sendOne(item)}
                        disabled={!item.email || sendingId === item.flat}
                        className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-xs font-bold transition"
                      >
                        {sendingId === item.flat ? "Sending..." : "Send Reminder"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

// ── Remaining Admin Sub-Pages (Categories, CSV, Meetings, Watchman, Audit, Special, Vendors) ──
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

function ExpDetailView({title,subtitle,allEntries,onBack,navView,setView,role="admin"}){
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
      <NavBar view={navView} setView={setView} role={role}/>
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

function MeetingsPage({data,setData,setView,navView,isAdmin,role="admin"}){
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
        <NavBar view={navView} setView={setView} role={role}/>
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
                      <button onClick={()=>{if(!isAdmin) return;const idx=TASK_STATUSES.indexOf(t.status||"Not Started");updTask(t.id,{status:TASK_STATUSES[(idx+1)%TASK_STATUSES.length]});}} disabled={!isAdmin} className={`mt-0.5 px-2 py-1 rounded-lg text-xs font-bold border whitespace-nowrap flex-shrink-0 ${st.bg} ${st.text} ${st.border} ${isAdmin?"hover:opacity-80 cursor-pointer":"cursor-default"}`}>
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
                        {isAdmin&&<button onClick={()=>setAddingComment(addingComment===t.id?null:t.id)} className={"p-1 rounded "+(addingComment===t.id?"text-indigo-600 bg-indigo-50":"text-indigo-400 hover:text-indigo-600")}><MessageSquare size={14}/></button>}
                        <button onClick={()=>setExpandedTask(isExp?null:t.id)} className="p-1 text-gray-400 hover:text-gray-600">{isExp?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>
                        {isAdmin&&<button onClick={()=>delTask(t.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14}/></button>}
                      </div>
                    </div>
                    {(comments.length>0||addingComment===t.id)&&(
                      <div className="px-5 pb-3 ml-16 space-y-2">
                        {comments.map(c=>(<div key={c.id} className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2"><MessageSquare size={12} className="text-indigo-400 mt-0.5 flex-shrink-0"/><div className="flex-1"><p className="text-xs text-gray-700">{c.text}</p><p className="text-xs text-gray-400 mt-0.5">{fmtIndian(c.date)}</p></div>{isAdmin&&<button onClick={()=>delTaskComment(t.id,c.id)} className="text-red-300 hover:text-red-500"><Trash2 size={11}/></button>}</div>))}
                        {isAdmin&&addingComment===t.id&&(<div className="flex gap-2"><input type="text" value={taskComment[t.id]||""} onChange={e=>setTaskComment(prev=>({...prev,[t.id]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter") addTaskComment(t.id);}} placeholder="Add a status comment..." autoFocus className="flex-1 px-3 py-1.5 border border-indigo-300 rounded-lg text-xs outline-none"/><button onClick={()=>addTaskComment(t.id)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Post</button><button onClick={()=>setAddingComment(null)} className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold">✕</button></div>)}
                      </div>
                    )}
                    {isExp&&(
                      <div className="border-t bg-indigo-50 px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Description</label><input type="text" value={t.description} onChange={e=>isAdmin&&updTask(t.id,{description:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Status</label><select value={t.status||"Not Started"} onChange={e=>isAdmin&&updTask(t.id,{status:e.target.value})} disabled={!isAdmin} className={`w-full px-2 py-1.5 border rounded text-sm font-semibold ${STATUS_STYLE[t.status||"Not Started"].bg} ${STATUS_STYLE[t.status||"Not Started"].text}`}>{TASK_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Owner</label><input type="text" value={t.owner||""} onChange={e=>isAdmin&&updTask(t.id,{owner:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label><input type="date" value={t.dueDate||""} onChange={e=>isAdmin&&updTask(t.id,{dueDate:e.target.value})} disabled={!isAdmin} className="w-full px-2 py-1.5 border rounded text-sm"/></div>
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
  const sorted=[...data.meetings].reverse();
  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">📋 Meetings</h1>
            <p className="text-indigo-200 text-xs mt-0.5">{data.meetings.length} meetings · {openTasks.length} open tasks{overdueTasks.length>0&&<span className="text-red-300"> · ⚠️ {overdueTasks.length} overdue</span>}</p>
          </div>
          {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-xl font-bold text-sm hover:bg-indigo-50 shadow transition"><Plus size={14}/> New Meeting</button>}
        </div>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {showNew&&isAdmin&&(
          <div className="bg-white rounded-2xl shadow-md border border-indigo-100 p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Create Meeting</h3>
              <button onClick={()=>setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} placeholder="e.g. Q1 Residents Meeting" className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Date</label><input type="date" value={nf.date} onChange={e=>setNf({...nf,date:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Year</label><select value={nf.year} onChange={e=>setNf({...nf,year:parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm">{YEARS.map(y=><option key={y}>{y}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Month</label><select value={nf.month} onChange={e=>setNf({...nf,month:parseInt(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm">{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Venue</label><input type="text" value={nf.venue} onChange={e=>setNf({...nf,venue:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Chairperson</label><input type="text" value={nf.chairperson} onChange={e=>setNf({...nf,chairperson:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Attendees</label><input type="text" value={nf.attendees} onChange={e=>setNf({...nf,attendees:e.target.value})} placeholder="Flat 101, 102..." className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-2"><button onClick={addMeeting} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700">Create</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm">Cancel</button></div>
          </div>
        )}

        {sorted.length===0&&!showNew&&<div className="text-center py-16 text-gray-300"><p className="text-6xl mb-4">📋</p><p className="text-lg font-semibold text-gray-400">No meetings yet</p></div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map(m=>{
            const tasks=m.actionItems||[];const done=tasks.filter(t=>t.status==="Completed").length;const pct=tasks.length?Math.round(done/tasks.length*100):0;
            return(
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-200 transition cursor-pointer flex flex-col" onClick={()=>setSelId(m.id)}>
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">{MONTHS[m.month]} {m.year}</span>
                      <h3 className="font-bold text-gray-800 text-sm mt-0.5 leading-tight">{m.title}</h3>
                    </div>
                    {isAdmin&&<button onClick={e=>{e.stopPropagation();delMeeting(m.id);}} className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0 rounded hover:bg-red-50 transition"><Trash2 size={13}/></button>}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">📅 {fmtIndian(m.date)}{m.venue&&<> · 📍 {m.venue}</>}</p>
                  {tasks.length>0&&(
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{done}/{tasks.length} tasks</span>
                        <span className="font-bold text-indigo-500">{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{width:pct+"%"}}></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50 rounded-b-2xl flex items-center gap-3 text-xs text-gray-400">
                  <span>📌 {(m.decisions||[]).length} decisions</span>
                  <span className="ml-auto text-indigo-400 font-semibold text-xs">Open →</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function WatchmanPage({data,setData,setView,navView,isAdmin,role="admin"}){
  const [showNew,setShowNew]=useState(false);
  const [showResignConfirm,setShowResignConfirm]=useState(false);
  const [editProfile,setEditProfile]=useState(false);
  const [newChild,setNewChild]=useState("");
  const [tab,setTab]=useState("profile");
  const [nf,setNf]=useState({watchmanName:"",fromDate:TODAY.toISOString().split("T")[0],toDate:"",reason:"",leaveType:"Casual Leave",coverArrangement:"",approvedBy:"",notes:""});
  const photoRef=useRef(null);

  const wm=data.watchman||{name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""};
  const [draftWm,setDraftWm]=useState(wm);

  function days(f,t){if(!f||!t) return 1;const d=Math.ceil((new Date(t)-new Date(f))/(864e5))+1;return d<1?1:d;}
  function add(){if(!nf.watchmanName.trim()||!nf.fromDate) return;const l={id:Date.now().toString(),...nf,status:"Approved"};setData(p=>({...p,watchmanLeaves:[l,...(p.watchmanLeaves||[])]}));setShowNew(false);setNf({watchmanName:"",fromDate:TODAY.toISOString().split("T")[0],toDate:"",reason:"",leaveType:"Casual Leave",coverArrangement:"",approvedBy:"",notes:""});}
  function upd(id,u){setData(p=>({...p,watchmanLeaves:(p.watchmanLeaves||[]).map(l=>l.id===id?{...l,...u}:l)}));}
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,watchmanLeaves:(p.watchmanLeaves||[]).filter(l=>l.id!==id)}));}
  function saveProfile(){setData(p=>({...p,watchman:{...draftWm}}));setEditProfile(false);}
  function handlePhoto(file){if(!file) return;const reader=new FileReader();reader.onload=e=>setDraftWm(d=>({...d,photo:e.target.result}));reader.readAsDataURL(file);}
  function addChild(){if(!newChild.trim()) return;setDraftWm(d=>({...d,children:[...(d.children||[]),newChild.trim()]}));setNewChild("");}
  function removeChild(i){setDraftWm(d=>({...d,children:(d.children||[]).filter((_,idx)=>idx!==i)}));}
  function resignWatchman(){
    const resigned={...wm,resignDate:TODAY.toISOString().split("T")[0],leaves:(data.watchmanLeaves||[]).filter(l=>l.watchmanName===wm.name)};
    setData(p=>({...p,pastWatchmen:[resigned,...(p.pastWatchmen||[])],watchman:{name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""},watchmanLeaves:(p.watchmanLeaves||[]).filter(l=>l.watchmanName!==wm.name)}));
    setShowResignConfirm(false);setDraftWm({name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""});
  }

  const leaves=data.watchmanLeaves||[];
  const pastWatchmen=data.pastWatchmen||[];
  const thisMonth=leaves.filter(l=>{const d=new Date(l.fromDate);return d.getFullYear()===TODAY.getFullYear()&&d.getMonth()===TODAY.getMonth();});
  const thisYear=leaves.filter(l=>new Date(l.fromDate).getFullYear()===TODAY.getFullYear());
  const hasProfile=wm.name&&wm.name.trim()!=="";

  return(
    <div className="min-h-screen bg-gray-50">
      {showResignConfirm&&(
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Confirm Resignation</h2>
            <p className="text-sm text-gray-600 text-center mb-5">Move <strong>{wm.name}</strong> to Past Watchmen history?</p>
            <div className="flex gap-3">
              <button onClick={resignWatchman} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Yes, Mark Resigned</button>
              <button onClick={()=>setShowResignConfirm(false)} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <header className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-6">
        <h1 className="text-3xl font-bold">👷 Watchman</h1>
        {hasProfile&&<p className="text-teal-100 text-sm mt-1">{wm.name} · Since {wm.joiningDate?fmtIndian(wm.joiningDate):"N/A"}</p>}
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-6 flex gap-0">
          {[["profile","👤 Profile"],["leaves","📋 Leaves"],["past","🕐 Past Watchmen"]].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} className={"px-4 py-3 text-sm font-bold border-b-2 transition whitespace-nowrap "+(tab===t?"border-teal-600 text-teal-700":"border-transparent text-gray-500 hover:text-gray-700")}>{label}</button>
          ))}
        </div>
      </div>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {tab==="profile"&&(
          <div className="space-y-6">
            {!hasProfile&&!editProfile&&isAdmin&&(
              <div className="text-center py-16 bg-white rounded-2xl shadow">
                <span className="text-6xl">👷</span>
                <p className="text-gray-500 mt-4 mb-4">No watchman profile set up yet.</p>
                <button onClick={()=>{setDraftWm({name:"",phone:"",photo:"",joiningDate:"",emergencyContact:"",address:"",spouseName:"",children:[],notes:""});setEditProfile(true);}} className="px-6 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">+ Add Watchman Profile</button>
              </div>
            )}
            {hasProfile&&!editProfile&&(
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="bg-gradient-to-r from-teal-600 to-teal-700 p-6 flex items-center gap-5">
                  <div className="w-24 h-24 rounded-full ring-4 ring-white ring-opacity-50 overflow-hidden bg-teal-800 flex items-center justify-center flex-shrink-0 shadow-lg">
                    {wm.photo?<img src={wm.photo} alt={wm.name} className="w-full h-full object-cover"/>:<span className="text-4xl font-bold text-white">{wm.name[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white">{wm.name}</h2>
                    {wm.joiningDate&&<p className="text-teal-100 text-sm mt-0.5">📅 Effective from {fmtIndian(wm.joiningDate)}</p>}
                    {wm.phone&&<p className="text-teal-100 text-sm">📞 {wm.phone}</p>}
                  </div>
                  {isAdmin&&(
                    <div className="flex flex-col gap-2">
                      <button onClick={()=>{setDraftWm({...wm,children:wm.children||[]});setEditProfile(true);}} className="px-4 py-2 bg-white bg-opacity-20 text-white rounded-lg text-sm font-semibold">✏️ Edit</button>
                      <button onClick={()=>setShowResignConfirm(true)} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-bold">🚪 Resigned</button>
                    </div>
                  )}
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-700 border-b pb-2">📋 Personal Details</h3>
                    {wm.address&&<div><p className="text-xs font-bold text-gray-400 uppercase">Address</p><p className="text-sm text-gray-700 mt-0.5">{wm.address}</p></div>}
                    {wm.emergencyContact&&<div><p className="text-xs font-bold text-gray-400 uppercase">Emergency Contact</p><p className="text-sm text-gray-700 mt-0.5">📞 {wm.emergencyContact}</p></div>}
                    {wm.notes&&<div><p className="text-xs font-bold text-gray-400 uppercase">Notes</p><p className="text-sm text-gray-600 italic mt-0.5">{wm.notes}</p></div>}
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-700 border-b pb-2">👨‍👩‍👧‍👦 Family Details</h3>
                    {wm.spouseName&&<div><p className="text-xs font-bold text-gray-400 uppercase">Spouse</p><p className="text-sm text-gray-700 mt-0.5">💑 {wm.spouseName}</p></div>}
                    {(wm.children||[]).length>0&&<div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Children ({wm.children.length})</p><div className="flex flex-wrap gap-2">{wm.children.map((c,i)=><span key={i} className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-semibold border border-teal-200">👦 {c}</span>)}</div></div>}
                  </div>
                </div>
              </div>
            )}
            {editProfile&&isAdmin&&(
              <div className="bg-white rounded-2xl shadow p-6 border-l-4 border-teal-500">
                <h3 className="font-bold text-gray-800 mb-5 text-lg">👷 {hasProfile?"Edit":"Add"} Watchman Profile</h3>
                <div className="flex items-center gap-5 mb-6 p-4 bg-teal-50 rounded-xl border border-teal-200">
                  <div className="w-20 h-20 rounded-full ring-4 ring-teal-300 overflow-hidden bg-teal-600 flex items-center justify-center cursor-pointer flex-shrink-0" onClick={()=>photoRef.current?.click()}>
                    {draftWm.photo?<img src={draftWm.photo} alt="" className="w-full h-full object-cover"/>:<span className="text-3xl font-bold text-white">{(draftWm.name||"?")[0]?.toUpperCase()}</span>}
                  </div>
                  <input type="file" accept="image/*" className="hidden" ref={photoRef} onChange={e=>handlePhoto(e.target.files[0])}/>
                  <div>
                    <button onClick={()=>photoRef.current?.click()} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700">📷 Upload Photo</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Full Name *</label><input type="text" value={draftWm.name} onChange={e=>setDraftWm(d=>({...d,name:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Phone</label><input type="text" value={draftWm.phone} onChange={e=>setDraftWm(d=>({...d,phone:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Joining Date</label><input type="date" value={draftWm.joiningDate} onChange={e=>setDraftWm(d=>({...d,joiningDate:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Emergency Contact</label><input type="text" value={draftWm.emergencyContact} onChange={e=>setDraftWm(d=>({...d,emergencyContact:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Address</label><input type="text" value={draftWm.address} onChange={e=>setDraftWm(d=>({...d,address:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Spouse Name</label><input type="text" value={draftWm.spouseName} onChange={e=>setDraftWm(d=>({...d,spouseName:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Notes</label><input type="text" value={draftWm.notes} onChange={e=>setDraftWm(d=>({...d,notes:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
                </div>
                <div className="mb-4 p-4 bg-gray-50 rounded-xl border">
                  <label className="block text-xs font-bold text-gray-500 mb-2">Children</label>
                  <div className="flex flex-wrap gap-2 mb-2">{(draftWm.children||[]).map((c,i)=><span key={i} className="flex items-center gap-1 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold">👦 {c}<button onClick={()=>removeChild(i)} className="ml-1 text-red-400 font-bold">×</button></span>)}</div>
                  <div className="flex gap-2"><input type="text" value={newChild} onChange={e=>setNewChild(e.target.value)} placeholder="Child's name..." className="flex-1 px-3 py-1.5 border rounded-lg text-sm"/><button onClick={addChild} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-semibold">+ Add</button></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={saveProfile} className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold">✓ Save Profile</button>
                  <button onClick={()=>setEditProfile(false)} className="px-6 py-2.5 bg-gray-400 text-white rounded-xl font-bold">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
        {tab==="leaves"&&(
          <div className="space-y-5">
            {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm"><Plus size={16}/> Add Leave</button>}
            {showNew&&isAdmin&&(<div className="bg-white rounded-xl shadow p-6 border-l-4 border-teal-500"><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-semibold text-gray-500 mb-1">Watchman Name *</label><input type="text" value={nf.watchmanName} onChange={e=>setNf({...nf,watchmanName:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Leave Type</label><select value={nf.leaveType} onChange={e=>setNf({...nf,leaveType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{["Casual Leave","Sick Leave","Emergency Leave","Planned Leave","Absent (Unauthorized)"].map(t=><option key={t}>{t}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label><input type="text" value={nf.reason} onChange={e=>setNf({...nf,reason:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">From *</label><input type="date" value={nf.fromDate} onChange={e=>setNf({...nf,fromDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">To</label><input type="date" value={nf.toDate} onChange={e=>setNf({...nf,toDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div></div><div className="flex gap-2"><button onClick={add} className="px-5 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm">Save</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>)}
            {leaves.length>0&&(<div className="bg-white rounded-xl shadow overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Watchman</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">From</th><th className="px-4 py-3 text-left">To</th><th className="px-4 py-3 text-center">Days</th><th className="px-4 py-3 text-left">Reason</th>{isAdmin&&<th className="px-4 py-3"/>}</tr></thead><tbody>{leaves.map(l=>(<tr key={l.id} className="border-t"><td className="px-4 py-3 font-semibold">{l.watchmanName}</td><td className="px-4 py-3">{l.leaveType}</td><td className="px-4 py-3 text-xs">{fmtIndian(l.fromDate)}</td><td className="px-4 py-3 text-xs">{l.toDate?fmtIndian(l.toDate):"—"}</td><td className="px-4 py-3 text-center font-bold">{days(l.fromDate,l.toDate)}</td><td className="px-4 py-3 text-xs text-gray-500">{l.reason||"—"}</td>{isAdmin&&<td className="px-4 py-3"><button onClick={()=>del(l.id)} className="text-red-400"><Trash2 size={14}/></button></td>}</tr>))}</tbody></table></div>)}
          </div>
        )}
        {tab==="past"&&(
          <div className="space-y-4">
            {pastWatchmen.length===0&&<div className="text-center py-16 text-gray-400">No past watchmen records yet.</div>}
            {pastWatchmen.map((pw,idx)=>(
              <div key={idx} className="bg-white rounded-2xl shadow p-5 border-l-4 border-gray-400">
                <h3 className="font-bold text-gray-800 text-lg">{pw.name||"—"}</h3>
                <p className="text-xs text-gray-500 mt-1">Joined: {fmtIndian(pw.joiningDate)} · Resigned: {fmtIndian(pw.resignDate)}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AuditPage({data, setData, setView, isAdmin, role}){
  const userRole = role || "admin";
  const [filter, setFilter] = useState("1y");
  const lastCalYear = TODAY.getFullYear()-1;
  const auditedPeriods = (data.auditedPeriods && data.auditedPeriods.length) ? data.auditedPeriods : [];
  const pendingAudit = auditedPeriods.find(a=>a.status==="pending") || null;
  const approvedAudits = auditedPeriods.filter(a=>a.status==="approved");
  const lastYearAudit = auditedPeriods.find(a=>a.year===lastCalYear) || null;

  function initiateAudit(){
    if(userRole!=="auditor" || lastYearAudit) return;
    if(!window.confirm("Initiate audit for "+lastCalYear+"?")) return;
    setData(p=>({...p,auditedPeriods:[...(p.auditedPeriods||[]),{year:lastCalYear,status:"pending",initiatedBy:"auditor",initiatedAt:TODAY.toISOString()}]}));
  }
  function approveAudit(year){
    if(!isAdmin || !window.confirm("Approve and FREEZE "+year+"?")) return;
    setData(p=>({...p,auditedPeriods:(p.auditedPeriods||[]).map(a=>a.year===year&&a.status==="pending"?{...a,status:"approved",approvedBy:"admin",approvedAt:TODAY.toISOString()}:a)}));
  }
  function rejectAudit(year){
    if(!isAdmin || !window.confirm("Reject audit for "+year+"?")) return;
    setData(p=>({...p,auditedPeriods:(p.auditedPeriods||[]).filter(a=>!(a.year===year&&a.status==="pending"))}));
  }

  function getFilteredData(){
    const now = new Date();
    let startDate, endDate = new Date(), startYear, startMonth, endYear, endMonth;
    if(filter === "3m") { startDate = new Date(now.getFullYear(), now.getMonth()-2, 1); startYear = startDate.getFullYear(); startMonth = startDate.getMonth(); endYear = now.getFullYear(); endMonth = now.getMonth(); }
    else if(filter === "6m") { startDate = new Date(now.getFullYear(), now.getMonth()-5, 1); startYear = startDate.getFullYear(); startMonth = startDate.getMonth(); endYear = now.getFullYear(); endMonth = now.getMonth(); }
    else if(filter === "1y") { startDate = new Date(now.getFullYear()-1, now.getMonth(), 1); startYear = startDate.getFullYear(); startMonth = startDate.getMonth(); endYear = now.getFullYear(); endMonth = now.getMonth(); }
    else if(filter === "lastyear") { startDate = new Date(now.getFullYear()-1, 0, 1); endDate = new Date(now.getFullYear()-1, 11, 31); startYear = now.getFullYear()-1; startMonth = 0; endYear = now.getFullYear()-1; endMonth = 11; }
    else { const year = parseInt(filter); startDate = new Date(year, 0, 1); endDate = new Date(year, 11, 31); startYear = year; startMonth = 0; endYear = year; endMonth = 11; }

    let collections = 0;
    FLATS.forEach(f => {
      for(let y = startYear; y <= endYear; y++) {
        const mStart = (y === startYear) ? startMonth : 0;
        const mEnd = (y === endYear) ? endMonth : 11;
        for(let m = mStart; m <= mEnd; m++) {
          const c = (data.collections[f] && data.collections[f][y+"-"+m]) || {amount: 2500, paid: false, advance: false};
          if(c.paid && !c.advance) collections += c.amount;
        }
      }
    });
    const expenses = data.expenses.filter(e => e.year >= startYear && e.year <= endYear && (e.year !== startYear || e.month >= startMonth) && (e.year !== endYear || e.month <= endMonth)).reduce((s, e) => s + e.amount, 0);
    let carryForward = 142799;
    const netBalance = carryForward + collections - expenses;
    return { collections, expenses, carryForward, netBalance, startDate: fmtIndian(startDate.toISOString().split("T")[0]), endDate: fmtIndian(endDate.toISOString().split("T")[0]) };
  }

  const auditData = getFilteredData();
  const filterOpts = [["1y", "Last 1 Year"], ["6m", "Last 6 Months"], ["3m", "Last 3 Months"], ["lastyear", "Last Calendar Year"], ...YEARS.map(y => [String(y), String(y)])];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6">
        <button onClick={() => setView("dashboard")} className="text-indigo-100 hover:text-white mb-2 font-semibold text-sm">← Dashboard</button>
        <h1 className="text-3xl font-bold">📋 Audit Report</h1>
      </header>
      <NavBar view="audit" setView={setView} role={userRole}/>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6 border-l-4 border-indigo-500">
          <h3 className="font-bold text-lg mb-4">🔐 Audit Management</h3>
          {approvedAudits.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {approvedAudits.map(a => <span key={a.year} className="px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-full text-xs font-bold">🔒 {a.year} — Frozen</span>)}
            </div>
          )}
          {pendingAudit && isAdmin && (
            <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl mb-4 flex justify-between items-center">
              <p className="font-bold text-yellow-800">⏳ Pending Audit — {pendingAudit.year}</p>
              <div className="flex gap-2">
                <button onClick={() => approveAudit(pendingAudit.year)} className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm">Approve and Freeze</button>
                <button onClick={() => rejectAudit(pendingAudit.year)} className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold text-sm">Reject</button>
              </div>
            </div>
          )}
          {userRole === "auditor" && !lastYearAudit && !pendingAudit && (
            <button onClick={initiateAudit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">📋 Initiate Audit for {lastCalYear}</button>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-wrap gap-2">
            {filterOpts.map(([val, lbl]) => (
              <button key={val} onClick={() => setFilter(val)} className={"px-4 py-2 rounded-lg text-sm font-bold " + (filter === val ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700")}>{lbl}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard label="Collections" value={"₹"+auditData.collections.toLocaleString()} bg="bg-green-50" borderColor="border-green-500"/>
          <MetricCard label="Expenses" value={"₹"+auditData.expenses.toLocaleString()} bg="bg-red-50" borderColor="border-red-500"/>
          <MetricCard label="Net Balance" value={"₹"+auditData.netBalance.toLocaleString()} bg="bg-blue-50" borderColor="border-blue-500"/>
        </div>
      </main>
    </div>
  );
}

function SpecialPage({data,setData,setView,navView,isAdmin,role="admin"}){
  const [showNew,setShowNew]=useState(false);
  const [selId,setSelId]=useState(null);
  const [nf,setNf]=useState({year:TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear(),month:TODAY.getMonth(),title:"",purpose:"",targetAmount:""});

  function addCollection(){
    if(!nf.title.trim()) return;
    const sc={id:Date.now().toString(),...nf,targetAmount:parseFloat(nf.targetAmount)||0,
      entries:FLATS.map(f=>({flatNum:f,amount:0,paid:false,paidDate:"",method:"Cash",note:""}))
    };
    setData(p=>({...p,specialCollections:[...(p.specialCollections||[]),sc]}));
    setShowNew(false);setSelId(sc.id);
  }
  function del(id){if(!window.confirm("Delete?")) return;setData(p=>({...p,specialCollections:(p.specialCollections||[]).filter(s=>s.id!==id)}));if(selId===id) setSelId(null);}
  function updEntry(scid,flatNum,upd){setData(p=>({...p,specialCollections:(p.specialCollections||[]).map(sc=>sc.id===scid?{...sc,entries:sc.entries.map(e=>e.flatNum===flatNum?{...e,...upd}:e)}:sc)}));}

  const scs=data.specialCollections||[];
  const sel=selId?scs.find(s=>s.id===selId):null;

  if(sel){
    const paid=sel.entries.filter(e=>e.paid);
    const total=paid.reduce((s,e)=>s+parseFloat(e.amount||0),0);
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6">
          <button onClick={()=>setSelId(null)} className="text-purple-100 hover:text-white mb-2 font-semibold text-sm">← All Special Collections</button>
          <h1 className="text-2xl font-bold">{sel.title}</h1>
        </header>
        <NavBar view={navView} setView={setView} role={role}/>
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-3 text-left">Flat</th><th className="px-3 py-3 text-left">Resident</th><th className="px-3 py-3 text-center">Amount (₹)</th><th className="px-3 py-3 text-center">Status</th><th className="px-3 py-3 text-left">Date</th><th className="px-3 py-3 text-left">Mode</th></tr></thead>
              <tbody>{sel.entries.map(e=>{const fd=data.flats[e.flatNum];const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;return(<tr key={e.flatNum} className={"border-t "+(e.paid?"bg-green-50":"hover:bg-gray-50")}><td className="px-3 py-2 font-bold text-blue-600">{e.flatNum}</td><td className="px-3 py-2 text-gray-600 text-xs">{name}</td><td className="px-3 py-2 text-center">{isAdmin?<input type="number" value={e.amount||""} onChange={ev=>updEntry(sel.id,e.flatNum,{amount:parseFloat(ev.target.value)||0})} className="w-20 px-2 py-1 border rounded text-sm text-center font-semibold"/>:<span className="font-semibold">₹{e.amount||0}</span>}</td><td className="px-3 py-2 text-center">{isAdmin?<button onClick={()=>updEntry(sel.id,e.flatNum,{paid:!e.paid,paidDate:!e.paid?TODAY.toISOString().split("T")[0]:""})} className={"px-3 py-1 rounded text-xs font-bold "+(e.paid?"bg-green-100 text-green-700":"bg-orange-100 text-orange-600")}>{e.paid?"✓ Paid":"Pending"}</button>:<span className="text-xs font-bold">{e.paid?"✓ Paid":"Pending"}</span>}</td><td className="px-3 py-2 text-xs">{e.paidDate||"—"}</td><td className="px-3 py-2 text-xs">{e.method||"Cash"}</td></tr>);})}</tbody>
              <tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={2} className="px-3 py-3 font-bold">Total</td><td className="px-3 py-3 text-center font-bold text-purple-700">₹{total.toLocaleString()}</td><td colSpan={3}></td></tr></tfoot>
            </table>
          </div>
        </main>
      </div>
    );
  }

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6"><h1 className="text-3xl font-bold">🎯 Special Collections</h1></header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {isAdmin&&<button onClick={()=>setShowNew(!showNew)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold text-sm"><Plus size={16}/> New Special Collection</button>}
        {showNew&&isAdmin&&(
          <div className="bg-white rounded-xl shadow p-6 border-l-4 border-purple-500">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="col-span-2 md:col-span-3"><label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label><input type="text" value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Purpose</label><input type="text" value={nf.purpose} onChange={e=>setNf({...nf,purpose:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Target (₹)</label><input type="number" value={nf.targetAmount} onChange={e=>setNf({...nf,targetAmount:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-2"><button onClick={addCollection} className="px-5 py-2 bg-purple-600 text-white rounded-lg font-semibold text-sm">Create</button><button onClick={()=>setShowNew(false)} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div>
          </div>
        )}
        {scs.map(sc=>(
          <div key={sc.id} className="bg-white rounded-xl shadow p-5 cursor-pointer" onClick={()=>setSelId(sc.id)}>
            <div className="flex justify-between items-start"><div><h3 className="font-bold text-gray-800">{sc.title}</h3><p className="text-xs text-gray-500 mt-0.5">{sc.purpose}</p></div>{isAdmin&&<button onClick={e=>{e.stopPropagation();del(sc.id);}} className="p-1 text-red-400"><Trash2 size={15}/></button>}</div>
          </div>
        ))}
      </main>
    </div>
  );
}

const SERVICE_TYPES = ["Electrician","Plumber","Lift Maintenance","Water Tanker","Pest Control","Security Agency","CCTV","Painter","Carpenter","Other"];
const CONTRACT_TYPES = ["AMC","On-Call","Monthly Retainer","One-Time"];

function VendorsPage({db, setView, navView, isAdmin, role}){
  const [vendors,setVendors]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [search,setSearch]=useState("");
  const [filterType,setFilterType]=useState("All");
  const emptyVendor={name:"",serviceType:"Electrician",phone:"",email:"",contractType:"AMC",notes:"",lastServiceDate:"",nextServiceDate:""};
  const [form,setForm]=useState(emptyVendor);

  useEffect(()=>{
    async function load(){
      try{
        const snap=await getDocs(collection(db,"vendors"));
        setVendors(snap.docs.map(d=>({id:d.id,...d.data()})));
      }catch(e){console.error(e);}
      setLoading(false);
    }
    load();
  },[]);

  async function saveVendor(){
    if(!form.name.trim()||!form.phone.trim()) return alert("Name and phone are required.");
    try{
      if(editing){
        await updateDoc(doc(db,"vendors",editing),form);
        setVendors(vs=>vs.map(v=>v.id===editing?{id:editing,...form}:v));
      } else {
        const ref=await addDoc(collection(db,"vendors"),{...form,createdAt:new Date().toISOString()});
        setVendors(vs=>[...vs,{id:ref.id,...form,createdAt:new Date().toISOString()}]);
      }
      setShowForm(false);setEditing(null);setForm(emptyVendor);
    }catch(e){alert("Error saving vendor: "+e.message);}
  }

  async function deleteVendor(id){
    if(!window.confirm("Delete this vendor?")) return;
    try{
      await deleteDoc(doc(db,"vendors",id));
      setVendors(vs=>vs.filter(v=>v.id!==id));
    }catch(e){alert("Error: "+e.message);}
  }

  const filtered=vendors.filter(v=>{
    const matchSearch=v.name.toLowerCase().includes(search.toLowerCase())||v.phone.includes(search);
    const matchType=filterType==="All"||v.serviceType===filterType;
    return matchSearch&&matchType;
  });

  if(loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-6">
        <h1 className="text-3xl font-bold">🔧 Vendor Directory</h1>
        <p className="text-teal-100 text-sm mt-1">{vendors.length} vendors registered</p>
      </header>
      <NavBar view={navView} setView={setView} role={role}/>
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-5">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 flex-1 flex-wrap">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vendors..." className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-48"/>
            <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="All">All Services</option>
              {SERVICE_TYPES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {isAdmin&&<button onClick={()=>{setShowForm(true);setEditing(null);setForm(emptyVendor);}} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm hover:bg-teal-700"><Plus size={15}/> Add Vendor</button>}
        </div>

        {showForm&&isAdmin&&(
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-teal-500">
            <h3 className="font-bold text-gray-800 mb-4">{editing?"Edit Vendor":"New Vendor"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[["Vendor Name *","name","text"],["Phone *","phone","text"],["Email","email","email"]].map(([label,field,type])=>(
                <div key={field}><label className="block text-xs font-bold text-gray-500 mb-1">{label}</label><input type={type} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              ))}
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Service Type</label><select value={form.serviceType} onChange={e=>setForm({...form,serviceType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{SERVICE_TYPES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Contract Type</label><select value={form.contractType} onChange={e=>setForm({...form,contractType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{CONTRACT_TYPES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Last Service</label><input type="date" value={form.lastServiceDate} onChange={e=>setForm({...form,lastServiceDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Next Service Due</label><input type="date" value={form.nextServiceDate} onChange={e=>setForm({...form,nextServiceDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
              <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Notes</label><input type="text" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveVendor} className="px-5 py-2 bg-teal-600 text-white rounded-lg font-semibold text-sm">✓ Save</button>
              <button onClick={()=>{setShowForm(false);setEditing(null);setForm(emptyVendor);}} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button>
            </div>
          </div>
        )}

        {filtered.length===0&&<div className="text-center py-16 text-gray-400"><Wrench size={48} className="mx-auto mb-4 opacity-30"/><p className="text-lg">No vendors found</p></div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v=>(
            <div key={v.id} className="bg-white rounded-xl shadow hover:shadow-md transition p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{v.name}</h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">{v.serviceType}</span>
                </div>
                {isAdmin&&<div className="flex gap-1">
                  <button onClick={()=>{setEditing(v.id);setForm({name:v.name,serviceType:v.serviceType,phone:v.phone,email:v.email||"",contractType:v.contractType||"AMC",notes:v.notes||"",lastServiceDate:v.lastServiceDate||"",nextServiceDate:v.nextServiceDate||""});setShowForm(true);}} className="p-1.5 text-blue-400 hover:text-blue-600 rounded"><Edit2 size={14}/></button>
                  <button onClick={()=>deleteVendor(v.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded"><Trash2 size={14}/></button>
                </div>}
              </div>
              <div className="space-y-1.5 text-sm text-gray-600">
                <p className="flex items-center gap-2"><Phone size={13} className="text-gray-400"/>{v.phone}</p>
                {v.email&&<p className="flex items-center gap-2"><Mail size={13} className="text-gray-400"/>{v.email}</p>}
                <p className="flex items-center gap-2"><Tag size={13} className="text-gray-400"/>{v.contractType||"AMC"}</p>
                {v.lastServiceDate&&<p className="text-xs text-gray-400">Last service: {fmtIndian(v.lastServiceDate)}</p>}
                {v.nextServiceDate&&<p className={"text-xs font-semibold "+(new Date(v.nextServiceDate)<new Date()?"text-red-500":"text-green-600")}>Next: {fmtIndian(v.nextServiceDate)}</p>}
                {v.notes&&<p className="text-xs text-gray-400 italic mt-2">{v.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN EXPORT — AppContent receives isAdmin from Dashboard.jsx
// ══════════════════════════════════════════════════════════
export default function AppContent({ isAdmin, role = "admin", flatNumber = null, currentUser = null }) {
  const [data, setData] = useState(initData);
  const [dataLoaded, setDataLoaded] = useState(false);

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

  useEffect(() => {
    if (!dataLoaded || !isAdmin) return;
    async function saveData() {
      try {
        const ref = doc(db, "apartmentData", "main");
        await setDoc(ref, data);
      } catch (e) {
        console.error("Error saving data:", e);
      }
    }
    saveData();
  }, [data, dataLoaded, isAdmin]);

  const [currentMonth,setCurrentMonth]    = useState(TODAY.getMonth());
  const [currentYear,setCurrentYear]      = useState(TODAY.getFullYear()<START_YEAR?START_YEAR:TODAY.getFullYear());
  const [view,setView]                    = useState("dashboard");

  useEffect(()=>{
    if(role==="resident") setView("resident");
  },[role]);

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
  const [confirmPmt,setConfirmPmt]        = useState(null);

  function gc(flat,y,m){return(data.collections[flat]&&data.collections[flat][y+"-"+m])||{amount:2500,paid:false,advance:false};}
  const canViewPersonal = role==="admin";
  const isOwnFlat = role==="resident" && parseInt(flatNumber)===selectedFlat;
  function isYearFrozen(year){return(data.auditedPeriods||[]).some(a=>a.year===year&&a.status==="approved");}
  function updateFlat(flat,upd){setData(p=>({...p,flats:{...p.flats,[flat]:{...p.flats[flat],...upd}}}));}

  function togglePayment(flat, y, m, details = {}) {
    if (!isAdmin || isYearFrozen(y)) return;
    const existingCur = gc(flat, y, m);
    const willBePaid = !existingCur.paid;
    const paidAmt = details.amount !== undefined ? details.amount : (existingCur.amount || 2500);
    const colDate = details.collectedDate || TODAY.toISOString().split("T")[0];
    const colMode = details.paymentMode || "Cash";
    const colFrom = details.receivedFrom || (data.flats[flat]?.ownerName || "Flat Owner");

    setData((p) => {
      const key = y + "-" + m;
      const col = p.collections[flat];
      const cur = col[key] || { amount: 2500, paid: false, advance: false };
      const nextPaid = !cur.paid;

      const updatedMonth = nextPaid
        ? {
            ...cur,
            amount: paidAmt,
            paid: true,
            advance: colMode === "Paid in advance" || colMode === "Paid in next month" || isFuture(y, m),
            receivedDate: colDate,
            receivedMode: colMode,
            receivedFrom: colFrom,
          }
        : {
            ...cur,
            paid: false,
            advance: false,
            receivedDate: "",
            receivedMode: "",
            receivedFrom: "",
          };

      const existingLedger = p.paymentLedger?.[flat] || [];
      let updatedLedger = existingLedger;
      if (nextPaid) {
        const newEntry = {
          id: Date.now().toString(),
          date: colDate,
          amount: paidAmt,
          method: colMode,
          receivedFrom: colFrom,
          comments: "Marked paid via tracker",
          months: [{ key, year: y, month: m }],
        };
        updatedLedger = [...existingLedger, newEntry];
      }

      return {
        ...p,
        collections: {
          ...p.collections,
          [flat]: { ...col, [key]: updatedMonth },
        },
        paymentLedger: {
          ...p.paymentLedger,
          [flat]: updatedLedger,
        },
      };
    });

    if (willBePaid) {
      const fd = data.flats[flat];
      const recipientEmail = fd?.currentTenant?.email || fd?.ownerEmail || "";
      const recipientName = fd?.currentTenant?.name || fd?.ownerName || `Flat ${flat}`;
      if (recipientEmail) {
        sendPortalEmail({
          toEmail: recipientEmail,
          toName: recipientName,
          subject: `Payment Receipt — Flat ${flat} (${MONTHS[m]} ${y})`,
          messageBody: `We have received your maintenance payment for Flat ${flat}.\n\n• Month: ${MONTHS[m]} ${y}\n• Amount Paid: ₹${paidAmt.toLocaleString("en-IN")}\n• Collected Date: ${fmtIndian(colDate)}\n• Payment Type: ${colMode}\n• Received From: ${colFrom}\n\nYou can also view and download this receipt anytime from your Resident Portal.`,
        });
      }
    }
  }

  function requestToggle(flat,y,m){if(!isAdmin||isYearFrozen(y)) return;setConfirmPmt({flat,year:y,month:m});}
  function confirmToggle(details){
    if(!confirmPmt) return;
    togglePayment(confirmPmt.flat, confirmPmt.year, confirmPmt.month, details);
    setConfirmPmt(null);
  }
  const confirmPmtInfo = confirmPmt
    ? {
        cur: gc(confirmPmt.flat, confirmPmt.year, confirmPmt.month),
        flatId: confirmPmt.flat,
        monthLabel: MONTHS[confirmPmt.month] + " " + confirmPmt.year,
        ownerName: data.flats[confirmPmt.flat]?.ownerName || `Owner ${confirmPmt.flat}`,
      }
    : null;

  function updateAmt(flat,y,m,amt){if(!isAdmin||isYearFrozen(y)) return;setData(p=>{const key=y+"-"+m,col=p.collections[flat];return{...p,collections:{...p.collections,[flat]:{...col,[key]:{...col[key]||{amount:2500,paid:false,advance:false},amount:parseFloat(amt)||0}}}};});}
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
    setData(p=>{const col={...p.collections[paymentFlat]};form.selectedMonths.forEach(m=>{const cur=col[m.key]||{amount:2500,paid:false,advance:false};col[m.key]={...cur,paid:true,advance:isFuture(m.year,m.month),receivedDate:form.date,receivedMode:form.method,receivedFrom:form.receivedFrom};});const entry={id:Date.now().toString(),date:form.date,amount:parseFloat(form.amount),method:form.method,receivedFrom:form.receivedFrom,comments:form.comments,months:form.selectedMonths};return{...p,collections:{...p.collections,[paymentFlat]:col},paymentLedger:{...p.paymentLedger,[paymentFlat]:[...(p.paymentLedger[paymentFlat]||[]),entry]}};});
    setShowRecordPmt(false);setPaymentFlat(null);
  }
  function markOwnerOccupied(flat){if(!isAdmin) return;const t=data.flats[flat].currentTenant;const history=t?[...data.flats[flat].tenantHistory,{...t,moveOutDate:new Date().toISOString().split("T")[0]}]:data.flats[flat].tenantHistory;updateFlat(flat,{ownerOccupied:true,currentTenant:null,tenantHistory:history});}
  function markForRent(flat){if(!isAdmin) return;updateFlat(flat,{ownerOccupied:false,currentTenant:null});}
  function vacateFlat(flat){if(!isAdmin) return;const t=data.flats[flat].currentTenant;if(!t) return;updateFlat(flat,{currentTenant:null,tenantHistory:[...data.flats[flat].tenantHistory,{...t,moveOutDate:new Date().toISOString().split("T")[0]}]});}
  function markOwnerSold(flat){
    if(!isAdmin) return;
    const currentOwner = data.flats[flat];
    if(currentOwner.ownerOccupied === false && currentOwner.currentTenant === null) {
      alert("Flat is vacant. Please mark owner first before selling.");
      return;
    }
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
  function bulkAdd(){if(!isAdmin||!bulkAmount) return;const amt=parseFloat(bulkAmount),key=currentYear+"-"+currentMonth,todayStr=TODAY.toISOString().split("T")[0];setData(p=>{const upd={};FLATS.filter(f=>!excludedFlats.includes(f)).forEach(f=>{upd[f]={...p.collections[f],[key]:{amount:amt,paid:true,advance:false,receivedDate:todayStr,receivedMode:"Cash"}};});return{...p,collections:{...p.collections,...upd}};});setBulkAmount("");setExcludedFlats([]);setShowBulkAdd(false);}
  function downloadData(){const uri="data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(data,null,2));const a=document.createElement("a");a.href=uri;a.download="apt-data-"+Date.now()+".json";document.body.appendChild(a);a.click();document.body.removeChild(a);}
  function onAddCat(n){if(!isAdmin) return;n=n.trim();if(!n||data.expenseCategories[n]) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[n]:[]}}));}
  function onDeleteCat(c){if(!isAdmin) return;if(!window.confirm("Delete "+c+"?")) return;setData(p=>{const e={...p.expenseCategories};delete e[c];return{...p,expenseCategories:e};});}
  function onRenameCat(o,n){if(!isAdmin) return;n=n.trim();if(!n||n===o) return;setData(p=>{const c={};Object.keys(p.expenseCategories).forEach(k=>{c[k===o?n:k]=p.expenseCategories[k];});return{...p,expenseCategories:c,expenses:p.expenses.map(e=>e.category===o?{...e,category:n}:e)};});}
  function onAddSub(c,n){if(!isAdmin) return;n=n.trim();if(!n||data.expenseCategories[c].includes(n)) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:[...p.expenseCategories[c],n]}}));}
  function onDeleteSub(c,s){if(!isAdmin) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:p.expenseCategories[c].filter(x=>x!==s)}}));}
  function onRenameSub(c,o,n){if(!isAdmin) return;n=n.trim();if(!n||n===o) return;setData(p=>({...p,expenseCategories:{...p.expenseCategories,[c]:p.expenseCategories[c].map(s=>s===o?n:s)},expenses:p.expenses.map(e=>(e.category===c&&e.subcategory===o)?{...e,subcategory:n}:e)}));}
  function onImport(preview){if(!isAdmin) return;setData(p=>{const nf={...p.flats};preview.forEach(({flatNum,occ,row})=>{const ex={...nf[flatNum]};ex.ownerName=row["owner_name"]||ex.ownerName;ex.ownerPhone=row["owner_phone"]||ex.ownerPhone;ex.ownerEmail=row["owner_email"]||ex.ownerEmail;if(occ==="owner"){ex.ownerOccupied=true;ex.currentTenant=null;}if(occ==="vacant"){ex.ownerOccupied=false;ex.currentTenant=null;}if(occ==="tenant"){ex.ownerOccupied=false;ex.currentTenant={name:row["tenant_name"]||"",phone:row["tenant_phone"]||"",email:row["tenant_email"]||"",moveInDate:parseDate(row["tenant_move_in_date"])||"",permanentAddress:row["tenant_permanent_address"]||"",adults:parseInt(row["tenant_adults"])||1,children:parseInt(row["tenant_children"])||0,idType:row["tenant_id_type"]||"",idNumber:row["tenant_id_number"]||"",emergencyContact:row["tenant_emergency_contact"]||"",emergencyRelation:row["tenant_emergency_relation"]||""};}nf[flatNum]=ex;});return{...p,flats:nf};});setShowCsvModal(false);alert("✅ Imported "+preview.length+" flats.");}
  function updateCommittee(members){setData(p=>({...p,managingCommittee:members}));}

  const stats=useMemo(()=>{const owners=FLATS.filter(f=>data.flats[f].ownerOccupied).length;const tenants=FLATS.filter(f=>!data.flats[f].ownerOccupied&&data.flats[f].currentTenant).length;return{owners,tenants,vacant:FLATS.length-owners-tenants};},[data]);
  const metrics=useMemo(()=>{const maint=FLATS.reduce((s,n)=>{const c=gc(n,currentYear,currentMonth);return s+(c.paid&&!c.advance?c.amount:0);},0);const special=getSpecialTotal(currentYear,currentMonth);const collected=maint+special;const expenses=data.expenses.filter(e=>e.year===currentYear&&e.month===currentMonth).reduce((s,e)=>s+e.amount,0);return{maint,special,collected,expenses,balance:collected-expenses};},[data,currentMonth,currentYear]);

  function trendData(){const maxMonth=currentYear<TODAY.getFullYear()?11:currentYear===TODAY.getFullYear()?TODAY.getMonth():-1;if(maxMonth===-1) return [];return MONTHS.slice(0,maxMonth+1).map((m,i)=>({month:m,collected:FLATS.reduce((s,n)=>{const c=gc(n,currentYear,i);return s+(c.paid&&!c.advance?c.amount:0);},0)+getSpecialTotal(currentYear,i),expenses:data.expenses.filter(e=>e.year===currentYear&&e.month===i).reduce((s,e)=>s+e.amount,0)})).map(d=>({...d,balance:d.collected-d.expenses}));}
  function topPendingFlats(){return FLATS.map(f=>{const p=getFlatPending(f);const fd=data.flats[f];const name=fd.currentTenant?fd.currentTenant.name:fd.ownerName;return{flat:"Flat "+f,name,pending:p.overdue+p.current};}).filter(f=>f.pending>0).sort((a,b)=>b.pending-a.pending).slice(0,8);}
  function yearlyExpBreakdown(){const bd={};data.expenses.filter(e=>e.year===currentYear).forEach(e=>{bd[e.category]=(bd[e.category]||0)+e.amount;});return Object.entries(bd).map(([name,value])=>({name,value}));}

  const ym={currentYear,setCurrentYear,currentMonth,setCurrentMonth};
  function cellClass(c,y,m){return c.paid?(c.advance?"bg-purple-100 text-purple-700":"bg-emerald-100 text-emerald-700"):(isPast(y,m)?"bg-red-100 text-red-600":isCurrent(y,m)?"bg-yellow-100 text-yellow-700":"bg-gray-100 text-gray-400");}
  function cellLabel(c,y,m){return c.paid?(c.advance?"ADV":"✓"):(isPast(y,m)?"✗":isCurrent(y,m)?"⏳":"—");}
  const tenantFields=[["Tenant Name","name","text"],["Phone","phone","text"],["Email","email","email"],["Move-in Date","moveInDate","date"],["Permanent Address","permanentAddress","text"],["Adults","adults","number"],["Children","children","number"],["ID Type","idType","text"],["ID Number","idNumber","text"],["Emergency Contact","emergencyContact","text"],["Relation","emergencyRelation","text"]];

  function getColDetail(flat){const c=gc(flat,currentYear,currentMonth);return{receivedDate:c.receivedDate||"",receivedFrom:c.receivedFrom||"",method:c.receivedMode||"Cash",note:c.note||""};}
  function updColDetail(flat,field,val){if(!isAdmin) return;setData(p=>{const key=currentYear+"-"+currentMonth;const col={...p.collections[flat]};const cur=col[key]||{amount:2500,paid:false,advance:false};const fieldMap={receivedDate:"receivedDate",receivedFrom:"receivedFrom",method:"receivedMode",note:"note"};col[key]={...cur,[fieldMap[field]]:val};return{...p,collections:{...p.collections,[flat]:col}};});}
  const monthPaidTotal=FLATS.reduce((s,f)=>{const c=gc(f,currentYear,currentMonth);return s+(c.paid&&!c.advance?c.amount:0);},0);
  const monthPaidCount=FLATS.filter(f=>{const c=gc(f,currentYear,currentMonth);return c.paid&&!c.advance;}).length;

  if (!dataLoaded) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600 font-semibold">Loading apartment data...</p>
      </div>
    </div>
  );

  // ── Shared Pages Accessible to Both Residents (Read-Only) and Admins ──
  if(view==="vendors") return <VendorsPage db={db} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;
  if(view==="meetings") return <MeetingsPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;
  if(view==="pics") return <PicsPage data={data} setData={setData} isAdmin={isAdmin} NavBar={NavBar} view={view} setView={setView} role={role}/>;

  // ── Resident Read-Only Routing ────────────────────────────
  if (role === "resident" || ["resident", "res_monthly", "res_6m", "res_year"].includes(view)) {
    const activeResView = ["resident", "res_monthly", "res_6m", "res_year"].includes(view) ? view : "resident";
    return <ResidentDashboard data={data} setView={setView} navView={activeResView} role={role} flatNumber={flatNumber} currentUser={currentUser} NavBar={NavBar} />;
  }

  // ── Admin / Auditor Routing ───────────────────────────────
  if(view==="reminders") return <RemindersPage data={data} setData={setData} setView={setView} isAdmin={isAdmin} role={role}/>;
  if(view==="audit") return <AuditPage data={data} setData={setData} setView={setView} isAdmin={isAdmin} role={role}/>;
  if(view==="watchman") return <WatchmanPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;
  if(view==="special") return <SpecialPage data={data} setData={setData} setView={setView} navView={view} isAdmin={isAdmin} role={role}/>;

  if(view==="expenseDetail"&&selectedExpEntry){
    const allEntries=selectedExpEntry.mode==="cat"?data.expenses.filter(e=>e.category===selectedExpEntry.category):data.expenses.filter(e=>e.subcategory===selectedExpEntry.subcategory);
    return <ExpDetailView title={selectedExpEntry.mode==="cat"?selectedExpEntry.category:selectedExpEntry.subcategory} subtitle={selectedExpEntry.mode==="cat"?"Category Summary":"Item Summary"} allEntries={allEntries} onBack={()=>setView("expenses")} navView={view} setView={setView} role={role}/>;
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">{[["Full Name","ownerName","text"],["📞 Phone","ownerPhone","text"],["✉️ Email","ownerEmail","email"],["Alternate Contact","ownerAltName","text"],["Alt. Phone","ownerAltPhone","text"],["Relation","ownerAltRelation","text"],["📅 Staying Since","ownerStayingSince","date"],["👥 Adults","ownerAdults","number"],["👧 Kids","ownerKids","number"]].map(([label,field,type])=>(<div key={field} className="bg-gray-50 rounded-xl p-4 border"><p className="text-xs font-bold text-gray-400 uppercase mb-2">{label}</p>{isAdmin?<input type={type} value={flat[field]||""} onChange={e=>updateFlat(selectedFlat,{[field]:e.target.value})} className="w-full bg-transparent text-lg font-semibold text-gray-800 border-b border-gray-300 focus:border-blue-500 outline-none pb-1"/>:<p className="text-lg font-semibold text-gray-800">{flat[field]||"—"}</p>}</div>))}</div>
            {isAdmin&&(
              <div className="border-t pt-4"><p className="text-xs font-semibold text-gray-600 mb-3">OCCUPANCY</p><div className="flex gap-3"><button onClick={()=>markOwnerOccupied(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status==="owner"?"border-blue-600 bg-blue-600 text-white":"border-blue-300 text-blue-600 hover:bg-blue-50")}>🏠 Owner Stays</button><button onClick={()=>markForRent(selectedFlat)} className={"px-4 py-2 rounded-lg text-sm font-semibold border-2 transition "+(status!=="owner"?"border-green-600 bg-green-600 text-white":"border-green-300 text-green-600 hover:bg-green-50")}>🔑 Rented / Vacant</button><button onClick={()=>{if(window.confirm("Are you sure you want to mark this property as sold?")) markOwnerSold(selectedFlat);}} className="px-4 py-2 rounded-lg text-sm font-semibold border-2 border-red-300 text-red-600 hover:bg-red-50">💼 Owner Sold</button></div></div>
            )}
          </div>
          {status!=="owner"&&(<div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">🧑‍💼 Tenant Details</h2>{isAdmin&&tenant&&!addingTenant&&<button onClick={()=>{if(window.confirm("Vacate tenant?")) vacateFlat(selectedFlat);}} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-semibold">Vacate</button>}</div>
            {!tenant&&!addingTenant&&<div className="text-center py-8 bg-gray-50 rounded-lg"><p className="text-4xl mb-3">🏚️</p><p className="text-gray-500 mb-4">Flat is vacant</p>{isAdmin&&<button onClick={()=>{setDraftTenant(emptyTenant());setAddingTenant(true);}} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">+ Add Tenant</button>}</div>}
            {addingTenant&&isAdmin&&<div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{tenantFields.map(([label,field,type])=>(<div key={field}><label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label><input type={type} value={draftTenant[field]||""} onChange={e=>setDraftTenant({...draftTenant,[field]:type==="number"?parseInt(e.target.value)||0:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div>))}</div><div className="flex gap-3"><button onClick={()=>saveTenant(selectedFlat)} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm">✓ Save</button><button onClick={()=>setAddingTenant(false)} className="px-6 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>}
            {tenant&&!addingTenant&&<div className="grid grid-cols-1 md:grid-cols-2 gap-4">{tenantFields.map(([label,field,type])=>(<div key={field}><label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>{isAdmin?<input type={type} value={tenant[field]||""} onChange={e=>updTenant(selectedFlat,field,type==="number"?parseInt(e.target.value)||0:e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>:<p className="px-3 py-2 bg-gray-50 border rounded-lg text-sm">{tenant[field]||"—"}</p>}</div>))}</div>}
          </div>)}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">💰 Payment History</h2><div className="flex gap-2"><select value={currentYear} onChange={e=>setCurrentYear(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm font-semibold">{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select>{isAdmin&&<button onClick={()=>openRecordPmt(selectedFlat)} className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"><CreditCard size={14}/> Record</button>}</div></div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-gray-50"><tr>{MONTHS.map((m,i)=><th key={i} className={"px-3 py-2 text-center font-semibold "+(isCurrent(currentYear,i)?"bg-yellow-50 text-yellow-700":"text-gray-600")}>{m}</th>)}</tr></thead><tbody><tr>{MONTHS.map((_,i)=>{const c=gc(selectedFlat,currentYear,i);return(<td key={i} className="px-1 py-3 text-center"><input type="number" value={c.amount} onChange={e=>updateAmt(selectedFlat,currentYear,i,e.target.value)} disabled={!isAdmin} className="w-16 px-1 py-1 text-center border rounded text-xs font-semibold mb-1 disabled:bg-gray-50"/><button onClick={()=>requestToggle(selectedFlat,currentYear,i)} disabled={!isAdmin} className={"w-full px-1 py-1 rounded text-xs font-bold "+cellClass(c,currentYear,i)+(isAdmin?" cursor-pointer hover:opacity-75":" cursor-default")}>{cellLabel(c,currentYear,i)}</button></td>);})}</tr></tbody></table></div>
          </div>
        </main>
        {confirmPmt&&confirmPmtInfo&&(
          <ConfirmModal
            title={confirmPmtInfo.cur.paid?"Mark as Pending?":"Record Maintenance Payment"}
            message={`Flat ${confirmPmtInfo.flatId} — ${confirmPmtInfo.monthLabel}`}
            subMessage={confirmPmtInfo.cur.paid?"This will revert the payment status to pending.":"Confirm amount, collected date, payment type, and sender."}
            confirmLabel={confirmPmtInfo.cur.paid?"Yes, Mark Pending":"✓ Save & Mark Paid"}
            confirmClass={confirmPmtInfo.cur.paid?"bg-orange-500 hover:bg-orange-600":"bg-emerald-600 hover:bg-emerald-700"}
            isMarkingPaid={!confirmPmtInfo.cur.paid}
            ownerName={confirmPmtInfo.ownerName}
            defaultAmount={confirmPmtInfo.cur.amount || 2500}
            onConfirm={confirmToggle}
            onCancel={()=>setConfirmPmt(null)}
          />
        )}
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
        <NavBar view={view} setView={setView} role={role}/>
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <ExpFilterBar filter={expFilter} setFilter={setExpFilter} entries={data.expenses}/>
          <div className="grid grid-cols-3 gap-4"><MetricCard label="Total (filtered)" value={"₹"+allExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400"/><MetricCard label={MONTHS[currentMonth]+" "+currentYear} value={"₹"+monthExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()} bg="bg-red-50" borderColor="border-red-400"/><MetricCard label="Entries (filtered)" value={allExpenses.length} bg="bg-purple-50" borderColor="border-purple-400"/></div>
          <div className="flex justify-between items-center flex-wrap gap-3"><YMSel {...ym}/><div className="flex gap-2">{isAdmin&&<><button onClick={()=>setShowCatMgr(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold text-sm"><Settings size={15}/> Categories</button><button onClick={()=>{setEditingExpense(null);setNewExpense({category:Object.keys(cats)[0]||"",subcategory:(Object.values(cats)[0]||[])[0]||"",amount:"",units:"",unitType:"monthly"});setShowAddExpense(!showAddExpense);}} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"><Plus size={16}/> Add Expense</button></>}</div></div>
          {showAddExpense&&isAdmin&&(<div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500"><h3 className="font-bold mb-4">{editingExpense?"Edit":"New"} Expense — {MONTHS[currentMonth]} {currentYear}</h3><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Category</label><select value={newExpense.category} onChange={e=>{const c=e.target.value;setNewExpense({...newExpense,category:c,subcategory:(cats[c]||[])[0]||""});}} className="w-full px-3 py-2 border rounded-lg text-sm">{Object.keys(cats).map(c=><option key={c}>{c}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Sub-Category</label><select value={newExpense.subcategory} onChange={e=>setNewExpense({...newExpense,subcategory:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">{subs.map(s=><option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹)</label><input type="number" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Units</label><input type="number" value={newExpense.units} onChange={e=>setNewExpense({...newExpense,units:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div><div><label className="block text-xs font-semibold text-gray-600 mb-1">Unit Type</label><input type="text" value={newExpense.unitType} onChange={e=>setNewExpense({...newExpense,unitType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"/></div></div><div className="flex gap-2"><button onClick={addExpense} className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm">Save</button><button onClick={()=>{setShowAddExpense(false);setEditingExpense(null);}} className="px-5 py-2 bg-gray-400 text-white rounded-lg font-semibold text-sm">Cancel</button></div></div>)}
          <div className="bg-white rounded-lg shadow overflow-x-auto"><div className="px-5 py-3 border-b flex justify-between items-center"><h3 className="font-bold">{MONTHS[currentMonth]} {currentYear}</h3></div><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-left">Item</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Units</th>{isAdmin&&<th className="px-4 py-3 text-center">Actions</th>}</tr></thead><tbody>{monthExpenses.length===0&&<tr><td colSpan={5} className="text-center py-10 text-gray-400">No expenses for {MONTHS[currentMonth]} {currentYear}</td></tr>}{monthExpenses.map(e=>(<tr key={e.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3"><button onClick={()=>{setSelectedExpEntry({category:e.category,mode:"cat"});setView("expenseDetail");}} className="text-blue-600 font-semibold hover:underline text-left">{e.category}</button></td><td className="px-4 py-3"><button onClick={()=>{setSelectedExpEntry({category:e.category,subcategory:e.subcategory,mode:"item"});setView("expenseDetail");}} className="text-indigo-600 font-semibold hover:underline text-left">{e.subcategory}</button></td><td className="px-4 py-3 text-right">₹{e.amount.toLocaleString()}</td><td className="px-4 py-3 text-right text-gray-500">{e.units} {e.unitType}</td>{isAdmin&&<td className="px-4 py-3 text-center"><div className="flex gap-2 justify-center"><button onClick={()=>{setEditingExpense(e);setNewExpense({category:e.category,subcategory:e.subcategory,amount:e.amount.toString(),units:e.units.toString(),unitType:e.unitType});setShowAddExpense(true);}} className="text-blue-500 hover:text-blue-700"><Edit2 size={15}/></button><button onClick={()=>deleteExpense(e.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15}/></button></div></td>}</tr>))}</tbody>{monthExpenses.length>0&&<tfoot className="bg-gray-50 border-t-2"><tr><td colSpan={2} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-right font-bold text-emerald-700">₹{monthExpenses.reduce((s,e)=>s+e.amount,0).toLocaleString()}</td><td colSpan={isAdmin?2:1}></td></tr></tfoot>}</table></div>
        </main>
      </div>
    );
  }

  // ── Collections (Shows Flat Number + Owner/Resident Name in Year Grid & Month Detail) ──
  if(view==="collections"){
    return(
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"><h1 className="text-3xl font-bold">Collections Tracker</h1></header>
        <NavBar view={view} setView={setView} role={role}/>
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
          {showBulkAdd&&isAdmin&&colView==="year"&&(<div className="bg-blue-50 border border-blue-200 rounded-lg p-5"><h3 className="font-bold mb-3">Bulk Add — {MONTHS[currentMonth]} {currentYear}</h3><input type="number" value={bulkAmount} onChange={e=>setBulkAmount(e.target.value)} placeholder="Amount ₹ (e.g. 2500)" className="px-3 py-2 border rounded-lg text-sm mr-3"/><div className="flex flex-wrap gap-2 my-3">{FLATS.map(f=><button key={f} onClick={()=>setExcludedFlats(excludedFlats.includes(f)?excludedFlats.filter(x=>x!==f):[...excludedFlats,f])} className={"px-2 py-1 rounded text-xs font-bold "+(excludedFlats.includes(f)?"bg-red-200 text-red-700":"bg-green-100 text-green-700")}>{f}</button>)}</div><div className="flex gap-2"><button onClick={bulkAdd} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold text-sm">Apply to {FLATS.length-excludedFlats.length} flats</button><button onClick={()=>setShowBulkAdd(false)} className="px-4 py-2 bg-gray-400 text-white rounded font-semibold text-sm">Cancel</button></div></div>)}
          {colView==="year"&&(
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 z-10 min-w-[145px]">Flat / Name</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    {MONTHS.map((m,i)=><th key={i} className={"px-2 py-2 text-center "+(isCurrent(currentYear,i)?"bg-yellow-50":"")}>{m}<br/><span className="text-gray-400 font-normal">{currentYear}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {FLATS.map(flat=>{
                    const fd=data.flats[flat];
                    const displayName=fd.currentTenant?`${fd.ownerName} (T: ${fd.currentTenant.name})`:fd.ownerName;
                    return(
                      <tr key={flat} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 cursor-pointer sticky left-0 bg-white hover:bg-blue-50 z-10" onClick={()=>{setSelectedFlat(flat);setAddingTenant(false);setView("flatDetail");}}>
                          <p className="font-bold text-blue-600">{flat}</p>
                          <p className="text-[11px] font-medium text-gray-700 truncate max-w-[150px]" title={displayName}>{displayName}</p>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={getFlatStatus(flat)}/></td>
                        {MONTHS.map((_,i)=>{const c=gc(flat,currentYear,i);return <td key={i} className="px-1 py-2 text-center"><div onClick={()=>requestToggle(flat,currentYear,i)} className={"text-xs font-bold rounded px-1 py-1 "+(isAdmin?"cursor-pointer hover:opacity-80":"")+cellClass(c,currentYear,i)}>₹{c.amount}</div></td>;})}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {colView==="month"&&(
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-bold">{MONTHS[currentMonth]} {currentYear}</h3><p className="text-xs text-gray-500">{monthPaidCount}/{FLATS.length} paid · ₹{monthPaidTotal.toLocaleString()}</p></div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-blue-50"><tr><th className="px-4 py-3 text-left">Flat</th><th className="px-4 py-3 text-left">Owner & Occupant</th><th className="px-4 py-3 text-center">Amount</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">From</th><th className="px-4 py-3 text-left">Mode</th><th className="px-4 py-3 text-left">Note</th></tr></thead>
              <tbody>{FLATS.map(flat=>{const c=gc(flat,currentYear,currentMonth);const fd=data.flats[flat];const det=getColDetail(flat);const paid=c.paid&&!c.advance;return(<tr key={flat} className={"border-t "+(paid?"bg-green-50":"hover:bg-orange-50")}><td className="px-4 py-2 font-bold text-blue-600 cursor-pointer hover:underline" onClick={()=>{setSelectedFlat(flat);setView("flatDetail");}}>{flat}</td><td className="px-4 py-2 text-xs"><p className="font-bold text-gray-800">{fd.ownerName}</p>{fd.currentTenant&&<p className="text-green-700">Tenant: {fd.currentTenant.name}</p>}</td><td className="px-4 py-2 text-center">{isAdmin?<input type="number" value={c.amount} onChange={e=>updateAmt(flat,currentYear,currentMonth,e.target.value)} className="w-20 px-2 py-1 border rounded text-sm text-center font-semibold"/>:<span className="font-semibold">₹{c.amount}</span>}</td><td className="px-4 py-2 text-center"><button onClick={()=>isAdmin&&requestToggle(flat,currentYear,currentMonth)} disabled={!isAdmin} className={"px-3 py-1 rounded text-xs font-bold border "+(paid?"bg-green-100 text-green-700 border-green-300":c.advance?"bg-purple-100 text-purple-700 border-purple-300":"bg-orange-100 text-orange-600 border-orange-300")+(isAdmin?" cursor-pointer":" cursor-default")}>{c.paid?(c.advance?"⏫ Advance":"✓ Paid"):"⏳ Pending"}</button></td><td className="px-4 py-2">{isAdmin?<input type="date" value={det.receivedDate} onChange={e=>updColDetail(flat,"receivedDate",e.target.value)} className="px-2 py-1 border rounded text-xs w-32"/>:<span className="text-xs">{det.receivedDate||"—"}</span>}</td><td className="px-4 py-2">{isAdmin?<input type="text" value={det.receivedFrom} onChange={e=>updColDetail(flat,"receivedFrom",e.target.value)} placeholder="Name..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs">{det.receivedFrom||"—"}</span>}</td><td className="px-4 py-2">{isAdmin?<select value={det.method} onChange={e=>updColDetail(flat,"method",e.target.value)} className="px-2 py-1 border rounded text-xs">{MARK_PAID_MODES.map(m=><option key={m}>{m}</option>)}</select>:<span className="text-xs">{det.method}</span>}</td><td className="px-4 py-2">{isAdmin?<input type="text" value={det.note} onChange={e=>updColDetail(flat,"note",e.target.value)} placeholder="Note..." className="px-2 py-1 border rounded text-xs w-28"/>:<span className="text-xs text-gray-500">{det.note||"—"}</span>}</td></tr>);})}</tbody>
              <tfoot className="bg-blue-50 border-t-2"><tr><td colSpan={2} className="px-4 py-3 font-bold">Total</td><td className="px-4 py-3 text-center font-bold">₹{monthPaidTotal.toLocaleString()}</td><td colSpan={5} className="px-4 py-3 text-xs text-gray-500">{monthPaidCount} flats paid</td></tr></tfoot>
              </table></div>
            </div>
          )}
        </main>
        {confirmPmt&&confirmPmtInfo&&(
          <ConfirmModal
            title={confirmPmtInfo.cur.paid?"Mark as Pending?":"Record Maintenance Payment"}
            message={`Flat ${confirmPmtInfo.flatId} — ${confirmPmtInfo.monthLabel}`}
            subMessage={confirmPmtInfo.cur.paid?"This will revert the payment status to pending.":"Confirm amount, collected date, payment type, and sender."}
            confirmLabel={confirmPmtInfo.cur.paid?"Yes, Mark Pending":"✓ Save & Mark Paid"}
            confirmClass={confirmPmtInfo.cur.paid?"bg-orange-500 hover:bg-orange-600":"bg-emerald-600 hover:bg-emerald-700"}
            isMarkingPaid={!confirmPmtInfo.cur.paid}
            ownerName={confirmPmtInfo.ownerName}
            defaultAmount={confirmPmtInfo.cur.amount || 2500}
            onConfirm={confirmToggle}
            onCancel={()=>setConfirmPmt(null)}
          />
        )}
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
      <NavBar view={view} setView={setView} role={role}/>
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
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">📈 Collection vs Expense — {currentYear}</h3>
            <p className="text-xs text-gray-400 mb-3">{currentYear===TODAY.getFullYear()?"Jan – "+MONTHS[TODAY.getMonth()]+" (actuals only)":"Full Year"}</p>
            {trendData().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">No data for future year</p>
              :<ResponsiveContainer width="100%" height={200}><LineChart data={trendData()}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip formatter={v=>"₹"+v.toLocaleString()}/><Legend/><Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} name="Collected"/><Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses"/></LineChart></ResponsiveContainer>}
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold mb-1">⚠️ Top Pending Flats</h3>
            <p className="text-xs text-gray-400 mb-3">Flats with the highest outstanding dues (all time)</p>
            {topPendingFlats().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">🎉 All flats are clear!</p>
              :<ResponsiveContainer width="100%" height={200}><BarChart data={topPendingFlats()} layout="vertical" margin={{left:10,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>"₹"+v.toLocaleString()}/><YAxis type="category" dataKey="flat" tick={{fontSize:11}} width={60}/><Tooltip formatter={v=>"₹"+v.toLocaleString()} labelFormatter={(_,payload)=>payload?.[0]?.payload?.name||""}/><Bar dataKey="pending" fill="#ef4444" radius={[0,3,3,0]} name="Pending"/></BarChart></ResponsiveContainer>}
          </div>
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h3 className="font-bold mb-1">🥧 Expense Categories — {currentYear}</h3>
            <p className="text-xs text-gray-400 mb-4">Full-year expense split by category</p>
            {yearlyExpBreakdown().length===0
              ?<p className="text-gray-400 text-sm text-center py-10">No expenses recorded for {currentYear}</p>
              :<div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="flex-shrink-0 w-full md:w-48">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart><Pie data={yearlyExpBreakdown()} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {yearlyExpBreakdown().map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie><Tooltip formatter={v=>"₹"+v.toLocaleString()}/></PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 overflow-y-auto" style={{maxHeight:"200px"}}>
                  {(()=>{const d=yearlyExpBreakdown();const total=d.reduce((s,x)=>s+x.value,0);return d.sort((a,b)=>b.value-a.value).map((item,i)=>(
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:COLORS[i%COLORS.length]}}></div>
                        <span className="text-xs text-gray-700 truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-xs font-bold text-gray-800">₹{item.value.toLocaleString()}</span>
                        <span className="text-xs text-gray-400 w-8 text-right">{Math.round(item.value/total*100)}%</span>
                      </div>
                    </div>
                  ))})()}
                </div>
              </div>}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-5 border-b flex justify-between items-center"><h3 className="font-bold">Collections — {MONTHS[currentMonth]} {currentYear}</h3><button onClick={()=>setView("special")} className="text-xs text-purple-600 font-semibold hover:underline">🎯 Special Collections →</button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Flat</th><th className="px-4 py-3 text-left">Owner Name</th><th className="px-4 py-3 text-left">Occupant Name</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-center">Amount</th><th className="px-4 py-3 text-center">Payment</th><th className="px-4 py-3 text-center">Outstanding</th></tr></thead>
          <tbody>{FLATS.map(flat=>{const c=gc(flat,currentYear,currentMonth);const st=getFlatStatus(flat);const f=data.flats[flat];const p=getFlatPending(flat);const tot=p.overdue+p.current;return(<tr key={flat} className="border-t hover:bg-gray-50"><td className="px-4 py-3 font-bold text-blue-600 cursor-pointer hover:underline" onClick={()=>{setSelectedFlat(flat);setAddingTenant(false);setView("flatDetail");}}>{flat}</td><td className="px-4 py-3 text-gray-800 text-xs font-bold">{f.ownerName||"—"}</td><td className="px-4 py-3">{st==="owner"&&<span className="text-blue-700 font-semibold text-xs">{f.ownerName}</span>}{st==="tenant"&&<span className="text-green-700 font-semibold text-xs">{f.currentTenant.name}</span>}{st==="vacant"&&<span className="text-red-400 text-xs">Vacant</span>}</td><td className="px-4 py-3"><StatusBadge status={st}/></td><td className="px-4 py-3 text-center font-semibold">₹{c.amount}</td><td className="px-4 py-3 text-center"><button onClick={()=>requestToggle(flat,currentYear,currentMonth)} disabled={!isAdmin} className={"px-3 py-1 rounded text-xs font-bold "+cellClass(c,currentYear,currentMonth)+(isAdmin?" cursor-pointer hover:opacity-80":" cursor-default")}>{c.paid?(c.advance?"ADV":"✓ Paid"):"✗ Pending"}</button></td><td className="px-4 py-3 text-center">{tot>0?isAdmin?<button onClick={()=>openRecordPmt(flat)} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold hover:bg-orange-200">₹{tot.toLocaleString()}</button>:<span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">₹{tot.toLocaleString()}</span>:p.credit>0?<span className="px-2 py-1 bg-purple-100 text-purple-600 rounded text-xs font-bold">ADV ₹{p.credit.toLocaleString()}</span>:<span className="text-green-500 text-xs font-bold">✓ Clear</span>}</td></tr>);})}</tbody></table></div>
        </div>
      </main>
      <CommitteeBanner members={data.managingCommittee||[]} isAdmin={isAdmin} onUpdate={updateCommittee}/>
      <NewNoticeAlert data={data}/>
      {confirmPmt&&confirmPmtInfo&&(
        <ConfirmModal
          title={confirmPmtInfo.cur.paid?"Mark as Pending?":"Record Maintenance Payment"}
          message={`Flat ${confirmPmtInfo.flatId} — ${confirmPmtInfo.monthLabel}`}
          subMessage={confirmPmtInfo.cur.paid?"This will revert the payment status to pending.":"Confirm amount, collected date, payment type, and sender."}
          confirmLabel={confirmPmtInfo.cur.paid?"Yes, Mark Pending":"✓ Save & Mark Paid"}
          confirmClass={confirmPmtInfo.cur.paid?"bg-orange-500 hover:bg-orange-600":"bg-emerald-600 hover:bg-emerald-700"}
          isMarkingPaid={!confirmPmtInfo.cur.paid}
          ownerName={confirmPmtInfo.ownerName}
          defaultAmount={confirmPmtInfo.cur.amount || 2500}
          onConfirm={confirmToggle}
          onCancel={()=>setConfirmPmt(null)}
        />
      )}
    </div>
  );
}
