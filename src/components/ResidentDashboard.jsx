import { useState } from "react";
import { Printer, CheckCircle, Sparkles } from "lucide-react";
import { PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, BarChart, Bar } from "recharts";

const FLATS = [101,102,103,104,201,202,203,204,301,302,303,304,401,402,403,404,501,502,503,504,601,602];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS = ["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#6366f1"];
const YEARS = Array.from({ length: 15 }, (_, i) => 2026 + i);
const TODAY = new Date();
const START_YEAR = 2026;

function fmtIndian(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function isPast(y, m) {
  return y < TODAY.getFullYear() || (y === TODAY.getFullYear() && m < TODAY.getMonth());
}

function isCurrent(y, m) {
  return y === TODAY.getFullYear() && m === TODAY.getMonth();
}

function StatusBadge({ status }) {
  if (status === "owner") return <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Owner Occupied</span>;
  if (status === "tenant") return <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">Tenant</span>;
  return <span className="px-2.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">Vacant</span>;
}

function MetricCard({ label, value, sub, bg, borderColor }) {
  return (
    <div className={bg + " rounded-lg p-4 border-l-4 " + (borderColor || "border-blue-500") + " shadow"}>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function printReceipt(receipt, flatNum, residentName, buildingName = "GM Jelani Heights") {
  const win = window.open("", "_blank", "width=650,height=700");
  if (!win) return alert("Please allow pop-ups to download/print the receipt.");
  const monthsText = receipt.months.map((m) => `${MONTHS[m.month]} ${m.year}`).join(", ");
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Receipt - Flat ${flatNum}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #1f2937; background: #f9fafb; }
          .card { max-width: 520px; margin: 0 auto; background: #fff; border: 2px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
          .header { background: linear-gradient(135deg, #1d4ed8, #4338ca); color: #fff; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
          .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.85; }
          .badge { display: inline-block; background: #dcfce7; color: #15803d; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 999px; margin-top: 12px; }
          .body { padding: 24px; }
          .amount-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 20px; }
          .amount-box .lbl { font-size: 11px; text-transform: uppercase; color: #166534; font-weight: 700; }
          .amount-box .val { font-size: 30px; font-weight: 800; color: #15803d; margin-top: 4px; }
          .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
          .row:last-child { border-bottom: none; }
          .row .k { color: #6b7280; font-weight: 600; }
          .row .v { font-weight: 700; color: #111827; text-align: right; }
          .footer { background: #f9fafb; padding: 14px 24px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
          @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; border: 1px solid #d1d5db; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1>${buildingName}</h1>
            <p>Official Maintenance Payment Receipt</p>
            <div class="badge">✓ PAYMENT RECEIVED</div>
          </div>
          <div class="body">
            <div class="amount-box">
              <div class="lbl">Amount Paid</div>
              <div class="val">₹${Number(receipt.amount).toLocaleString("en-IN")}</div>
            </div>
            <div class="row"><span class="k">Receipt ID</span><span class="v">#${String(receipt.id).slice(-6).toUpperCase()}</span></div>
            <div class="row"><span class="k">Flat Number</span><span class="v">Flat ${flatNum}</span></div>
            <div class="row"><span class="k">Resident / Owner</span><span class="v">${residentName}</span></div>
            <div class="row"><span class="k">Collected Date</span><span class="v">${receipt.date ? fmtIndian(receipt.date) : "Recorded"}</span></div>
            <div class="row"><span class="k">Payment Mode</span><span class="v">${receipt.method || "Cash"}</span></div>
            <div class="row"><span class="k">Period Covered</span><span class="v">${monthsText}</span></div>
          </div>
          <div class="footer">
            This is a system-generated digital receipt from ${buildingName} Portal.
          </div>
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
    </html>
  `);
  win.document.close();
}

export default function ResidentDashboard({ data, setView, navView, role, flatNumber, currentUser, NavBar }) {
  const flatNum = parseInt(flatNumber);
  const flatData = data?.flats?.[flatNum];

  const maxAllowedYear = TODAY.getFullYear() < START_YEAR ? START_YEAR : TODAY.getFullYear();
  const [selYear, setSelYear] = useState(maxAllowedYear);
  const [selMonth, setSelMonth] = useState(TODAY.getMonth());
  const [auditYear, setAuditYear] = useState(maxAllowedYear);

  if (!flatNum || !flatData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-10 bg-white rounded-2xl shadow">
          <p className="text-5xl mb-4">🏠</p>
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Flat Not Assigned</h2>
          <p className="text-gray-500 text-sm">Please ask Admin to link your Flat Number to your profile.</p>
        </div>
      </div>
    );
  }

  const getCol = (f, y, m) =>
    (data.collections?.[f] && data.collections[f][y + "-" + m]) || { amount: 2500, paid: false, advance: false };

  const getSpecialForMonth = (y, m) =>
    (data.specialCollections || []).reduce((sum, sc) => {
      return (
        sum +
        sc.entries
          .filter((e) => {
            if (!e.paid || !e.paidDate) return false;
            const d = new Date(e.paidDate);
            return d.getFullYear() === y && d.getMonth() === m;
          })
          .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
      );
    }, 0);

  // ── VIEW 0: MY FLAT PROFILE (Read-Only + Infographics + Last 3 Receipts) ──
  if (navView === "resident") {
    const status = flatData.ownerOccupied ? "owner" : flatData.currentTenant ? "tenant" : "vacant";
    const tenant = flatData.currentTenant;
    const residentDisplayName =
      (tenant && tenant.name) ||
      (flatData.ownerName && !flatData.ownerName.startsWith("Owner ") ? flatData.ownerName : null) ||
      currentUser ||
      `Resident (Flat ${flatNum})`;

    const ledgerEntries = (data.paymentLedger?.[flatNum] || []).map((entry) => ({
      id: entry.id,
      date: entry.date || "",
      amount: entry.amount || 0,
      method: entry.method || "Cash",
      months: entry.months || [],
      sortKey: entry.date ? new Date(entry.date).getTime() : Number(entry.id) || 0,
    }));

    const coveredMonthKeys = new Set(ledgerEntries.flatMap((e) => (e.months || []).map((m) => m.key)));

    const directPaidEntries = [];
    YEARS.forEach((y) =>
      MONTHS.forEach((_, m) => {
        const key = y + "-" + m;
        const c = getCol(flatNum, y, m);
        if (c.paid && !coveredMonthKeys.has(key)) {
          directPaidEntries.push({
            id: `col-${y}-${m}`,
            date: c.receivedDate || "",
            amount: c.amount || 0,
            method: c.receivedMode || "Cash",
            months: [{ key, year: y, month: m }],
            sortKey: c.receivedDate ? new Date(c.receivedDate).getTime() : new Date(y, m, 1).getTime(),
          });
        }
      })
    );

    const last3Receipts = [...ledgerEntries, ...directPaidEntries]
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 3);

    const activeYr = maxAllowedYear;
    const elapsedMonthsCount = activeYr === TODAY.getFullYear() ? TODAY.getMonth() + 1 : 12;
    let yrPaidCount = 0;
    let yrPaidAmount = 0;
    let yrAdvanceCount = 0;
    const pendingList = [];

    YEARS.forEach((y) =>
      MONTHS.forEach((_, m) => {
        const c = getCol(flatNum, y, m);
        if (y === activeYr) {
          if (c.paid && !c.advance) {
            yrPaidCount++;
            yrPaidAmount += c.amount || 0;
          } else if (c.paid && c.advance) {
            yrAdvanceCount++;
            yrPaidAmount += c.amount || 0;
          }
        }
        if (!c.paid && (isPast(y, m) || isCurrent(y, m))) {
          pendingList.push({ label: `${MONTHS[m]} ${y}`, amount: c.amount || 0 });
        }
      })
    );
    const personalPaidPct = elapsedMonthsCount > 0 ? Math.min(100, Math.round((yrPaidCount / elapsedMonthsCount) * 100)) : 100;
    const totalPendingDue = pendingList.reduce((s, p) => s + p.amount, 0);

    const curY = maxAllowedYear;
    const curM = TODAY.getMonth();
    const buildingPaidFlats = FLATS.filter((f) => {
      const c = getCol(f, curY, curM);
      return c.paid && !c.advance;
    }).length;
    const buildingRatePct = Math.round((buildingPaidFlats / FLATS.length) * 100);
const ownerOccupiedCount = FLATS.filter((f) => data.flats?.[f]?.ownerOccupied).length;
const rentedCount = FLATS.filter((f) => !data.flats?.[f]?.ownerOccupied && data.flats?.[f]?.currentTenant).length;
const vacantCount = FLATS.length - ownerOccupiedCount - rentedCount;
    const yrExpList = (data.expenses || []).filter((e) => e.year === activeYr);
    const yrExpTotal = yrExpList.reduce((s, e) => s + e.amount, 0);
    const catAgg = {};
    yrExpList.forEach((e) => {
      catAgg[e.category] = (catAgg[e.category] || 0) + e.amount;
    });
    const top3Categories = Object.entries(catAgg)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, amount]) => ({
        name,
        amount,
        pct: yrExpTotal > 0 ? Math.round((amount / yrExpTotal) * 100) : 0,
      }));

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white px-6 py-8">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-3xl shadow-lg ring-2 ring-white ring-opacity-25 flex-shrink-0">
                🏠
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-blue-300 font-bold flex items-center gap-1.5">
                  <Sparkles size={13} className="text-yellow-300" /> {data.building?.name || "GM Jelani Heights"}
                </p>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mt-0.5">
                  Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200">{residentDisplayName}</span>
                </h1>
                <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                  <span className="px-3 py-0.5 bg-white bg-opacity-15 border border-white border-opacity-20 rounded-full text-xs font-bold text-white">
                    Flat {flatNum}
                  </span>
                  <StatusBadge status={status} />
                  <span className="text-xs text-blue-200">Read-Only Resident Portal</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <NavBar view={navView} setView={setView} role={role} />

        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-gray-800">💳 Flat {flatNum} Payment Health ({activeYr})</h2>
                  <span className={"px-2.5 py-0.5 rounded-full text-xs font-bold " + (pendingList.length === 0 ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700")}>
                    {pendingList.length === 0 ? "✓ All Clear" : `${pendingList.length} Due`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 my-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                    <p className="text-lg font-extrabold text-emerald-700">₹{yrPaidAmount.toLocaleString()}</p>
                    <p className="text-[11px] font-semibold text-emerald-600">Paid in {activeYr}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                    <p className="text-lg font-extrabold text-blue-700">{yrPaidCount}/{elapsedMonthsCount}</p>
                    <p className="text-[11px] font-semibold text-blue-600">Months Paid</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                    <p className="text-lg font-extrabold text-purple-700">{yrAdvanceCount}</p>
                    <p className="text-[11px] font-semibold text-purple-600">Advance Mos.</p>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                    <span>On-Time Payment Progress</span>
                    <span className="text-emerald-600 font-bold">{personalPaidPct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2.5 rounded-full transition-all" style={{ width: personalPaidPct + "%" }}></div>
                  </div>
                </div>
              </div>

              {pendingList.length > 0 ? (
                <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-orange-700 mb-1.5">⚠️ Pending Dues: ₹{totalPendingDue.toLocaleString()}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {pendingList.slice(0, 6).map((p) => (
                      <span key={p.label} className="px-2 py-0.5 bg-white border border-orange-200 text-orange-700 rounded-full text-xs font-semibold">
                        {p.label} (₹{p.amount.toLocaleString()})
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-semibold text-emerald-700 flex items-center gap-2">
                  <CheckCircle size={15} /> Zero pending maintenance dues for Flat {flatNum}. Thank you!
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-gray-800">🏢 Building Health Snapshot</h2>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                    {MONTHS[curM]} {curY}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="font-bold text-gray-700">Building Collection ({MONTHS[curM]})</span>
                    <span className="font-extrabold text-indigo-700">{buildingPaidFlats} of {FLATS.length} flats paid ({buildingRatePct}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2.5 rounded-full" style={{ width: buildingRatePct + "%" }}></div>
                  </div>
                </div>

                <p className="text-xs font-bold text-gray-500 uppercase mb-2.5">Where Maintenance Money Goes ({activeYr})</p>
                {top3Categories.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-4 text-center">No expenses recorded yet for {activeYr}.</p>
                ) : (
                  <div className="space-y-2.5">
                    {top3Categories.map((cat, idx) => (
                      <div key={cat.name}>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-gray-700 truncate max-w-[210px]">{cat.name}</span>
                          <span className="text-gray-800 font-bold">₹{cat.amount.toLocaleString()} <span className="text-gray-400 font-normal">({cat.pct}%)</span></span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className="h-2 rounded-full" style={{ width: cat.pct + "%", backgroundColor: COLORS[idx % COLORS.length] }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setView("res_year")}
                className="mt-4 w-full py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition"
              >
                View Full {activeYr} Financial Breakdown →
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">🧾 Last 3 Payment Receipts</h2>
                <p className="text-xs text-gray-400 mt-0.5">Your most recent maintenance payments for Flat {flatNum}</p>
              </div>
              <span className="text-xs font-semibold text-gray-400">Showing latest {last3Receipts.length}</span>
            </div>

            {last3Receipts.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm">
                No payment receipts recorded yet for Flat {flatNum}.
              </div>
            ) : (
              <div className="space-y-3">
                {last3Receipts.map((entry) => (
                  <div key={entry.id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex justify-between items-center flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-emerald-800 text-base">₹{Number(entry.amount).toLocaleString()} · {entry.method}</p>
                        <span className="text-[11px] px-2 py-0.5 bg-white border border-emerald-200 text-emerald-700 rounded-full font-bold">
                          ✓ Paid
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        📅 {entry.date ? `Collected on ${fmtIndian(entry.date)}` : "Date not recorded"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex flex-wrap gap-1">
                        {entry.months.map((m) => (
                          <span key={m.key} className="px-2.5 py-1 bg-emerald-200 text-emerald-900 rounded-full text-xs font-bold">
                            {MONTHS[m.month]} {m.year}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => printReceipt(entry, flatNum, residentDisplayName, data.building?.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold shadow-sm transition"
                        title="Print or Save PDF Receipt"
                      >
                        <Printer size={13} /> Receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">👤 Registered Owner Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                ["Owner Name", flatData.ownerName],
                ["Phone", flatData.ownerPhone],
                ["Email", flatData.ownerEmail],
                ["Alternate Contact", flatData.ownerAltName],
                ["Alt. Phone", flatData.ownerAltPhone],
                ["Relation", flatData.ownerAltRelation],
                ["Staying Since", fmtIndian(flatData.ownerStayingSince)],
                ["Adults", flatData.ownerAdults],
                ["Kids", flatData.ownerKids],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3.5 border border-gray-200">
                  <p className="text-xs font-bold text-gray-400 uppercase">{label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-1">{val || "—"}</p>
                </div>
              ))}
            </div>
          </div>

          {tenant && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 border-l-4 border-green-500">
              <h2 className="text-lg font-bold text-gray-800 mb-4">🧑‍💼 Current Tenant Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  ["Tenant Name", tenant.name],
                  ["Phone", tenant.phone],
                  ["Email", tenant.email],
                  ["Move-in Date", fmtIndian(tenant.moveInDate)],
                  ["Permanent Address", tenant.permanentAddress],
                  ["Adults / Children", `${tenant.adults || 0} Adults, ${tenant.children || 0} Children`],
                  ["Emergency Contact", tenant.emergencyContact],
                  ["Relation", tenant.emergencyRelation],
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3.5 border border-gray-200">
                    <p className="text-xs font-bold text-gray-400 uppercase">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">{val || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(flatData.previousOwners?.length > 0 || flatData.tenantHistory?.length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 border-l-4 border-purple-500">
              <h2 className="text-lg font-bold text-gray-800 mb-4">📜 Past Owner & Tenant History (Flat {flatNum})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {flatData.previousOwners?.length > 0 && (
                  <div>
                    <h3 className="font-bold text-purple-700 text-sm mb-3">Previous Owners</h3>
                    <div className="space-y-3">
                      {flatData.previousOwners.map((o, idx) => (
                        <div key={idx} className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 text-xs space-y-1">
                          <p className="font-bold text-sm text-gray-800">{o.name}</p>
                          {o.phone && <p>📞 {o.phone}</p>}
                          {o.stayingSince && <p>📅 Stayed Since: {fmtIndian(o.stayingSince)}</p>}
                          {o.saleDate && <p className="text-purple-700 font-semibold">💼 Sold: {fmtIndian(o.saleDate)}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {flatData.tenantHistory?.length > 0 && (
                  <div>
                    <h3 className="font-bold text-green-700 text-sm mb-3">Past Tenants</h3>
                    <div className="space-y-3">
                      {flatData.tenantHistory.map((t, idx) => (
                        <div key={idx} className="bg-green-50 border border-green-200 rounded-xl p-3.5 text-xs space-y-1">
                          <p className="font-bold text-sm text-gray-800">{t.name}</p>
                          {t.phone && <p>📞 {t.phone}</p>}
                          {t.moveInDate && <p>📅 Moved In: {fmtIndian(t.moveInDate)}</p>}
                          {t.moveOutDate && <p className="text-red-600 font-semibold">🚪 Moved Out: {fmtIndian(t.moveOutDate)}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── VIEW 1: LAST 3 MONTHS DETAILED CONTRIBUTIONS & EXPENSES ──
  if (navView === "res_monthly") {
    const last3Options = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
      if (d.getFullYear() >= START_YEAR) {
        last3Options.push({
          year: d.getFullYear(),
          month: d.getMonth(),
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " (Current)" : ""}`,
        });
      }
    }

    const isAllowed = last3Options.some((o) => o.year === selYear && o.month === selMonth);
    const activeYear = isAllowed ? selYear : (last3Options[0]?.year ?? TODAY.getFullYear());
    const activeMonth = isAllowed ? selMonth : (last3Options[0]?.month ?? TODAY.getMonth());

    const monthExpenses = (data.expenses || []).filter((e) => e.year === activeYear && e.month === activeMonth);
    const totalMaint = FLATS.reduce((s, f) => {
      const c = getCol(f, activeYear, activeMonth);
      return s + (c.paid && !c.advance ? c.amount : 0);
    }, 0);
    const totalSpecial = getSpecialForMonth(activeYear, activeMonth);
    const totalCol = totalMaint + totalSpecial;
    const totalExp = monthExpenses.reduce((s, e) => s + e.amount, 0);

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold">📅 Monthly Contributions & Expenses</h1>
            <p className="text-blue-100 text-sm mt-1">Last 3 months flat-by-flat collections & itemized expenses (Read-Only)</p>
          </div>
        </header>
        <NavBar view={navView} setView={setView} role={role} />
        <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          <div className="flex flex-wrap gap-2 items-center bg-white p-4 rounded-xl shadow-sm">
            <span className="text-xs font-bold text-gray-500 uppercase mr-1">Select Month (Last 3M):</span>
            {last3Options.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setSelYear(opt.year);
                  setSelMonth(opt.month);
                }}
                className={
                  "px-4 py-2 rounded-lg text-xs font-bold border transition " +
                  (activeYear === opt.year && activeMonth === opt.month
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Total Collections" value={"₹" + totalCol.toLocaleString()} sub={totalSpecial > 0 ? `Maint ₹${totalMaint.toLocaleString()} + Special ₹${totalSpecial.toLocaleString()}` : undefined} bg="bg-emerald-50" borderColor="border-emerald-500" />
            <MetricCard label="Total Expenses" value={"₹" + totalExp.toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400" />
            <MetricCard label="Net Month Balance" value={"₹" + (totalCol - totalExp).toLocaleString()} bg={totalCol - totalExp >= 0 ? "bg-blue-50" : "bg-red-50"} borderColor={totalCol - totalExp >= 0 ? "border-blue-500" : "border-red-500"} />
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50">
              <h3 className="font-bold text-gray-800">🏢 Flat Contributions — {MONTHS[activeMonth]} {activeYear}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Flat</th>
                    <th className="px-4 py-3 text-left">Resident / Owner</th>
                    <th className="px-4 py-3 text-center">Amount</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Collected Date</th>
                    <th className="px-4 py-3 text-left">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {FLATS.map((f) => {
                    const c = getCol(f, activeYear, activeMonth);
                    const fd = data.flats[f];
                    const name = fd.currentTenant ? fd.currentTenant.name : fd.ownerName;
                    const isPaid = c.paid && !c.advance;
                    return (
                      <tr key={f} className={"border-t " + (f === flatNum ? "bg-blue-50 font-semibold" : "hover:bg-gray-50")}>
                        <td className="px-4 py-2.5 font-bold text-blue-600">{f} {f === flatNum && "(You)"}</td>
                        <td className="px-4 py-2.5 text-gray-700">{name}</td>
                        <td className="px-4 py-2.5 text-center">₹{c.amount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={"px-2.5 py-0.5 rounded-full text-xs font-bold " + (isPaid ? "bg-emerald-100 text-emerald-700" : c.advance ? "bg-purple-100 text-purple-700" : "bg-red-100 text-red-600")}>
                            {isPaid ? "✓ Paid" : c.advance ? "ADV" : "⏳ Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{c.receivedDate ? fmtIndian(c.receivedDate) : "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{c.paid ? c.receivedMode || "Cash" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50">
              <h3 className="font-bold text-gray-800">🧾 Itemized Expenses — {MONTHS[activeMonth]} {activeYear}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Description / Item</th>
                    <th className="px-4 py-3 text-right">Units</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {monthExpenses.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">No expenses recorded for {MONTHS[activeMonth]} {activeYear}</td></tr>
                  )}
                  {monthExpenses.map((e) => (
                    <tr key={e.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-700">{e.category}</td>
                      <td className="px-4 py-3 text-gray-600">{e.subcategory}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">{e.units ? `${e.units} ${e.unitType}` : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">₹{e.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {monthExpenses.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 font-bold">Total Expenses</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-700">₹{totalExp.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── VIEW 2: LAST 6 MONTHS NET SUMMARY (Totals Only) ───────
  if (navView === "res_6m") {
    const last6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (y < START_YEAR) continue;

      const maint = FLATS.reduce((s, f) => {
        const c = getCol(f, y, m);
        return s + (c.paid && !c.advance ? c.amount : 0);
      }, 0);
      const special = getSpecialForMonth(y, m);
      const collections = maint + special;
      const expenses = (data.expenses || []).filter((e) => e.year === y && e.month === m).reduce((s, e) => s + e.amount, 0);
      last6.push({
        label: `${MONTHS[m]} ${y}`,
        collections,
        expenses,
        net: collections - expenses,
      });
    }

    const sumCol = last6.reduce((s, r) => s + r.collections, 0);
    const sumExp = last6.reduce((s, r) => s + r.expenses, 0);
    const sumNet = sumCol - sumExp;

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-teal-600 to-emerald-700 text-white p-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold">📊 Last 6 Months Net Summary</h1>
            <p className="text-teal-100 text-sm mt-1">Monthly Net Collections, Net Expenses & Net Balance (Summary Totals Only)</p>
          </div>
        </header>
        <NavBar view={navView} setView={setView} role={role} />
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="6-Month Collections" value={"₹" + sumCol.toLocaleString()} bg="bg-emerald-50" borderColor="border-emerald-500" />
            <MetricCard label="6-Month Expenses" value={"₹" + sumExp.toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400" />
            <MetricCard label="6-Month Net Surplus/Deficit" value={(sumNet >= 0 ? "+" : "") + "₹" + sumNet.toLocaleString()} bg={sumNet >= 0 ? "bg-blue-50" : "bg-red-50"} borderColor={sumNet >= 0 ? "border-blue-500" : "border-red-500"} />
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-bold text-gray-800 mb-4">📈 6-Month Cash Flow Comparison</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={last6}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => "₹" + v.toLocaleString()} />
                <Tooltip formatter={(v) => "₹" + v.toLocaleString()} />
                <Legend />
                <Bar dataKey="collections" name="Net Collections" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Net Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left">Month</th>
                  <th className="px-5 py-3 text-right">Net Collections</th>
                  <th className="px-5 py-3 text-right">Net Expenses</th>
                  <th className="px-5 py-3 text-right">Net of Month</th>
                </tr>
              </thead>
              <tbody>
                {last6.map((row) => (
                  <tr key={row.label} className="border-t hover:bg-gray-50">
                    <td className="px-5 py-3.5 font-bold text-gray-800">{row.label}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-emerald-700">₹{row.collections.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-orange-600">₹{row.expenses.toLocaleString()}</td>
                    <td className={"px-5 py-3.5 text-right font-bold " + (row.net >= 0 ? "text-blue-700" : "text-red-600")}>
                      {(row.net >= 0 ? "+" : "") + "₹" + row.net.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 border-t-2 font-bold">
                <tr>
                  <td className="px-5 py-3.5">6-Month Total</td>
                  <td className="px-5 py-3.5 text-right text-emerald-700">₹{sumCol.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-right text-orange-700">₹{sumExp.toLocaleString()}</td>
                  <td className={"px-5 py-3.5 text-right " + (sumNet >= 0 ? "text-blue-700" : "text-red-700")}>
                    {(sumNet >= 0 ? "+" : "") + "₹" + sumNet.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </main>
      </div>
    );
  }

  // ── VIEW 3: YEAR AUDIT (Jan–Dec, capped to current month if active year) ──
  const availableAuditYears = YEARS.filter((y) => y <= TODAY.getFullYear());
  const cutoffMonth = auditYear === TODAY.getFullYear() ? TODAY.getMonth() : auditYear < TODAY.getFullYear() ? 11 : -1;

  const yearMonthlyRows = [];
  for (let m = 0; m <= cutoffMonth; m++) {
    const maint = FLATS.reduce((s, f) => {
      const c = getCol(f, auditYear, m);
      return s + (c.paid && !c.advance ? c.amount : 0);
    }, 0);
    const special = getSpecialForMonth(auditYear, m);
    const col = maint + special;
    const exp = (data.expenses || []).filter((e) => e.year === auditYear && e.month === m).reduce((s, e) => s + e.amount, 0);
    yearMonthlyRows.push({
      month: MONTHS[m],
      collections: col,
      expenses: exp,
      netSaving: col - exp,
    });
  }

  const yearExpensesFiltered = (data.expenses || []).filter((e) => e.year === auditYear && e.month <= cutoffMonth);
  const catTotalsMap = {};
  yearExpensesFiltered.forEach((e) => {
    catTotalsMap[e.category] = (catTotalsMap[e.category] || 0) + e.amount;
  });
  const categoryChartData = Object.entries(catTotalsMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  const yrTotalCol = yearMonthlyRows.reduce((s, r) => s + r.collections, 0);
  const yrTotalExp = yearMonthlyRows.reduce((s, r) => s + r.expenses, 0);
  const yrTotalNet = yrTotalCol - yrTotalExp;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">📈 Year Audit — {auditYear}</h1>
            <p className="text-indigo-100 text-sm mt-1">
              {auditYear === TODAY.getFullYear()
                ? `Showing Jan – ${MONTHS[cutoffMonth]} ${auditYear} (data available up to current month)`
                : `Full Year Report (Jan – Dec ${auditYear})`}
            </p>
          </div>
          <select
            value={auditYear}
            onChange={(e) => setAuditYear(parseInt(e.target.value))}
            className="px-4 py-2 rounded-xl text-gray-800 font-bold text-sm bg-white shadow"
          >
            {availableAuditYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </header>
      <NavBar view={navView} setView={setView} role={role} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard label={`Collections Total (${auditYear})`} value={"₹" + yrTotalCol.toLocaleString()} bg="bg-emerald-50" borderColor="border-emerald-500" />
          <MetricCard label={`Expenses Total (${auditYear})`} value={"₹" + yrTotalExp.toLocaleString()} bg="bg-orange-50" borderColor="border-orange-400" />
          <MetricCard label={`Net Savings (${auditYear})`} value={(yrTotalNet >= 0 ? "+" : "") + "₹" + yrTotalNet.toLocaleString()} bg={yrTotalNet >= 0 ? "bg-indigo-50" : "bg-red-50"} borderColor={yrTotalNet >= 0 ? "border-indigo-500" : "border-red-500"} />
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-bold text-gray-800 mb-1">🥧 Year Expense Breakdown by Category ({auditYear})</h3>
          <p className="text-xs text-gray-400 mb-4">Total categorized spending from Jan to {MONTHS[cutoffMonth]} {auditYear}</p>
          {categoryChartData.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No expenses recorded in this period.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={categoryChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={3}>
                    {categoryChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => "₹" + v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {categoryChartData.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }}></span>
                      <span className="text-xs font-semibold text-gray-700">{c.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-800">₹{c.value.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-2">({yrTotalExp > 0 ? Math.round((c.value / yrTotalExp) * 100) : 0}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800">📅 Month-by-Month Net Savings — {auditYear}</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left">Month</th>
                <th className="px-5 py-3 text-right">Collections</th>
                <th className="px-5 py-3 text-right">Expenses</th>
                <th className="px-5 py-3 text-right">Net Saving</th>
              </tr>
            </thead>
            <tbody>
              {yearMonthlyRows.map((r) => (
                <tr key={r.month} className="border-t hover:bg-gray-50">
                  <td className="px-5 py-3 font-bold text-gray-800">{r.month} {auditYear}</td>
                  <td className="px-5 py-3 text-right text-emerald-700 font-semibold">₹{r.collections.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-orange-600 font-semibold">₹{r.expenses.toLocaleString()}</td>
                  <td className={"px-5 py-3 text-right font-bold " + (r.netSaving >= 0 ? "text-indigo-700" : "text-red-600")}>
                    {(r.netSaving >= 0 ? "+" : "") + "₹" + r.netSaving.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-indigo-50 border-t-2 font-bold">
              <tr>
                <td className="px-5 py-3.5">Total ({yearMonthlyRows.length} months)</td>
                <td className="px-5 py-3.5 text-right text-emerald-700">₹{yrTotalCol.toLocaleString()}</td>
                <td className="px-5 py-3.5 text-right text-orange-700">₹{yrTotalExp.toLocaleString()}</td>
                <td className={"px-5 py-3.5 text-right " + (yrTotalNet >= 0 ? "text-indigo-700" : "text-red-700")}>
                  {(yrTotalNet >= 0 ? "+" : "") + "₹" + yrTotalNet.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </main>
    </div>
  );
}
