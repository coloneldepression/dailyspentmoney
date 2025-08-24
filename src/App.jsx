import React, { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

/**
 * Tek dosyalık React uygulaması (Vite uyumlu)
 * GÜNCEL: 
 * - Dark/Light toggle düzeltildi
 * - Ayarlar modalı çalışır
 * - Grup renkleri (7-8 seçenek)
 * - Her GRUP için "bekleyen girişler" (apply etmeden birden fazla değer ekle)
 * - Her giriş için etiket: gerekli / fuzuli / zorunlu
 * - Apply tıklandığında bekleyen girişler geçmişe tek tek işlenir
 * - Geçmiş penceresinde etiket dağılımı pie chart
 * - Haftalık otomatik yedekleme (JSON indirir)
 */

// ---- Yardımcılar
const STORAGE_KEY = "telefon_harcama_gruplari_v1";
const fmt = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n ?? 0);
const nowISO = () => new Date().toISOString();
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

const NEED_TYPES = ["gerekli", "fuzuli", "zorunlu"];
const PALETTE = [
  { key: "slate",  name: "Gri",    bg: "bg-slate-50",   border: "border-slate-300",  text:"text-slate-900",  darkBg:"dark:bg-slate-800",   darkText:"dark:text-slate-100" },
  { key: "emerald",name: "Yeşil",  bg: "bg-emerald-50", border: "border-emerald-300",text:"text-emerald-900",darkBg:"dark:bg-emerald-900/30",darkText:"dark:text-emerald-100" },
  { key: "sky",    name: "Mavi",   bg: "bg-sky-50",     border: "border-sky-300",   text:"text-sky-900",    darkBg:"dark:bg-sky-900/30",   darkText:"dark:text-sky-100" },
  { key: "amber",  name: "Amber",  bg: "bg-amber-50",   border: "border-amber-300", text:"text-amber-900",  darkBg:"dark:bg-amber-900/30", darkText:"dark:text-amber-100" },
  { key: "violet", name: "Mor",    bg: "bg-violet-50",  border: "border-violet-300",text:"text-violet-900", darkBg:"dark:bg-violet-900/30",darkText:"dark:text-violet-100" },
  { key: "rose",   name: "Pembe",  bg: "bg-rose-50",    border: "border-rose-300",  text:"text-rose-900",   darkBg:"dark:bg-rose-900/30",  darkText:"dark:text-rose-100" },
  { key: "indigo", name: "Çivit",  bg: "bg-indigo-50",  border: "border-indigo-300",text:"text-indigo-900", darkBg:"dark:bg-indigo-900/30",darkText:"dark:text-indigo-100" },
  { key: "orange", name: "Turuncu",bg:"bg-orange-50",   border: "border-orange-300",text:"text-orange-900",  darkBg:"dark:bg-orange-900/30", darkText:"dark:text-orange-100" },
];

const getGroupStyle = (colorKey = "slate") => {
  const c = PALETTE.find((p) => p.key === colorKey) || PALETTE[0];
  return `${c.bg} ${c.border} ${c.text} ${c.darkBg} ${c.darkText}`;
};

const applyDarkClass = (on) => {
  const html = document.documentElement;
  const body = document.body;
  if (on) { html.classList.add('dark'); body.classList.add('dark'); }
  else { html.classList.remove('dark'); body.classList.remove('dark'); }
};

function useLocalState(initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      return { ...initial, ...parsed };
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  return [state, setState];
}

// ---- Başlangıç durumu
const starterState = {
  groups: [
    { id: uuid(), name: "150", value: 150, note: "", color: "emerald", ticked: false, pending: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: uuid(), name: "300", value: 300, note: "", color: "sky",     ticked: false, pending: [], createdAt: nowISO(), updatedAt: nowISO() },
  ],
  history: [],
  lastResetAt: null,
  autoBackupEnabled: true,
  lastAutoBackupAt: null,
  darkMode: false, // default light
};

export default function App() {
  const [state, setState] = useLocalState(starterState);
  const [showHistory, setShowHistory] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // karanlık modu uygula
  useEffect(() => { applyDarkClass(!!state.darkMode); }, [state.darkMode]);

  // haftalık otomatik yedek (uygulama açıldığında kontrol)
  useEffect(() => {
    if (!state.autoBackupEnabled) return;
    const last = state.lastAutoBackupAt ? new Date(state.lastAutoBackupAt).getTime() : 0;
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - last > WEEK && state.history.length > 0) {
      exportJSON();
      setState((s) => ({ ...s, lastAutoBackupAt: nowISO() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(() => state.history.reduce((acc, h) => acc + (h.delta || 0), 0), [state.history]);

  // ---- Grup işlemleri
  const addGroup = () => {
    setState((s) => ({
      ...s,
      groups: [
        ...s.groups,
        { id: uuid(), name: "Yeni Grup", value: 0, note: "", color: "slate", ticked: false, pending: [], createdAt: nowISO(), updatedAt: nowISO() },
      ],
    }));
  };

  const updateGroup = (id, patch) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: nowISO() } : g)),
    }));
  };

  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const confirmDeleteGroup = (id) => setPendingDeleteId(id);
  const doDeleteGroup = () => {
    if (!pendingDeleteId) return;
    setState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== pendingDeleteId) }));
    setPendingDeleteId(null);
  };

  // ---- Geçmiş / kasa
  const pushHistoryEntry = ({ group, input, need = "gerekli" }) => {
    const delta = (Number(group.value) || 0) - (Number(input) || 0);
    const rec = {
      id: uuid(),
      ts: nowISO(),
      groupId: group.id,
      groupNameAtTheTime: group.name,
      groupValueAtTheTime: Number(group.value) || 0,
      input: Number(input) || 0,
      delta,
      note: "",
      need,
    };
    setState((s) => ({ ...s, history: [rec, ...s.history] }));
  };

  // Bir grubun TÜM bekleyen girişlerini geçmişe uygula
  const applyGroupPending = (groupId) => {
    const g = state.groups.find((x) => x.id === groupId);
    if (!g || !g.pending?.length) return;
    for (const p of g.pending) {
      pushHistoryEntry({ group: g, input: p.amount, need: p.need });
    }
    // bekleyenleri temizle
    updateGroup(groupId, { pending: [] });
  };

  const updateHistoryRecord = (id, patch) => {
    setState((s) => ({
      ...s,
      history: s.history.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  };

  const doResetCommon = () => {
    setState((s) => ({ ...s, history: [], lastResetAt: nowISO() }));
    setShowResetConfirm(false);
  };

  // ---- Dışa / içe aktar
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harcama_gruplari_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!parsed || typeof parsed !== "object") throw new Error("Geçersiz JSON");
      if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.history)) throw new Error("Eksik alanlar");
      setState(parsed);
      setShowImport(false);
    } catch (e) {
      alert("İçe aktarım başarısız: " + e.message);
    }
  };

  // ---- Grafik veri (etiket dağılımı)
  const needStats = useMemo(() => {
    const base = { gerekli: 0, fuzuli: 0, zorunlu: 0 };
    for (const h of state.history) {
      const k = h?.need || "gerekli";
      base[k] = (base[k] || 0) + 1;
    }
    return [
      { name: "gerekli", value: base.gerekli, color: "#10b981" },
      { name: "fuzuli", value: base.fuzuli, color: "#f43f5e" },
      { name: "zorunlu", value: base.zorunlu, color: "#f59e0b" },
    ];
  }, [state.history]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Üst bar */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-2">
          <div className="text-xl font-semibold">Ortak Kasa</div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setShowHistory(true)}
              title="Son sıfırlamadan beri tüm işlemler"
            >
              Toplam: <span className={total >= 0 ? "text-emerald-500" : "text-rose-400"}>{total >= 0 ? "+" : ""}{fmt(total)}</span>
            </button>
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setShowResetConfirm(true)}>
              Sıfırla
            </button>
            <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800" />
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={addGroup}>
              Yeni Grup
            </button>
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={exportJSON}>
              Dışa Aktar
            </button>
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setShowImport(true)}>
              İçe Aktar
            </button>
            <button
              className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setState((s) => ({ ...s, darkMode: !s.darkMode }))}
              title="Karanlık Mod"
            >
              {state.darkMode ? "☾ Dark" : "☀︎ Light"}
            </button>
            <button
              className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => setShowSettings(true)}
            >
              Ayarlar
            </button>
          </div>
        </div>
      </header>

      {/* İçerik */}
      <main className="mx-auto max-w-3xl w-full px-4 py-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4">
          Kural: (ortak kasaya etki) = (grup değeri − girilen). Grubu tiklemek kasayı etkilemez.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {state.groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              onUpdate={updateGroup}
              onDelete={confirmDeleteGroup}
              onApplyPending={() => applyGroupPending(g.id)}
            />
          ))}
        </div>
      </main>

      {/* Geçmiş paneli */}
      {showHistory && (
        <Modal onClose={() => setShowHistory(false)} title="İşlem Geçmişi (Son Sıfırlamadan Beri)">
          {/* Özet grafik */}
          <div className="mb-4">
            <div className="text-sm text-zinc-600 dark:text-zinc-300 mb-2">Harcama Etiket Dağılımı</div>
            <div className="h-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie dataKey="value" data={needStats} innerRadius={45} outerRadius={70}>
                    {needStats.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <HistoryList history={state.history} onChange={(id, patch) => updateHistoryRecord(id, patch)} />
        </Modal>
      )}

      {/* İçe aktarım paneli */}
      {showImport && (
        <Modal onClose={() => setShowImport(false)} title="JSON İçe Aktar">
          <textarea
            className="w-full h-48 p-3 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Buraya JSON yapıştırın"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={importJSON}>
              Aktar
            </button>
          </div>
        </Modal>
      )}

      {/* Ayarlar modalı */}
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} title="Ayarlar">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">Haftalık otomatik yedekleme</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!state.autoBackupEnabled}
                onChange={(e) => setState((s) => ({ ...s, autoBackupEnabled: e.target.checked }))}
              />
              {state.autoBackupEnabled ? "Açık" : "Kapalı"}
            </label>
          </div>
        </Modal>
      )}

      {/* Silme onayı modalı */}
      {pendingDeleteId && (
        <Modal onClose={() => setPendingDeleteId(null)} title="Grubu Sil">
          <div className="text-sm text-zinc-700 dark:text-zinc-300">Bu grubu silmek istediğinize emin misiniz?</div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setPendingDeleteId(null)}>Vazgeç</button>
            <button className="rounded-xl px-3 py-1.5 text-sm border border-rose-200 text-rose-600 dark:border-rose-900/40 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={doDeleteGroup}>Sil</button>
          </div>
        </Modal>
      )}

      {/* Sıfırlama onayı modalı */}
      {showResetConfirm && (
        <Modal onClose={() => setShowResetConfirm(false)} title="Ortak Kasayı Sıfırla">
          <div className="text-sm text-zinc-700 dark:text-zinc-300">Toplam ve işlem geçmişi sıfırlanacak.</div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setShowResetConfirm(false)}>Vazgeç</button>
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={doResetCommon}>Sıfırla</button>
          </div>
        </Modal>
      )}

      <footer className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">Yerel kullanım için — veriler tarayıcıda saklanır.</footer>
    </div>
  );
}

function GroupCard({ group, onUpdate, onDelete, onApplyPending }) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(group.name);
  const [tempValue, setTempValue] = useState(group.value);
  const [tempNote, setTempNote] = useState(group.note || "");
  const [tempColor, setTempColor] = useState(group.color || "slate");

  // Bekleyen giriş eklemek için yerel alanlar
  const [amount, setAmount] = useState("");
  const [need, setNeed] = useState("gerekli");

  useEffect(() => {
    setTempName(group.name);
    setTempValue(group.value);
    setTempNote(group.note || "");
    setTempColor(group.color || "slate");
  }, [group.id]);

  const submitEdit = () => {
    const v = Number(tempValue);
    if (Number.isNaN(v)) { alert("Geçerli bir sayısal değer girin."); return; }
    onUpdate(group.id, { name: tempName?.trim() || String(v), value: v, note: tempNote, color: tempColor });
    setEditing(false);
  };

  const addPending = () => {
    const n = Number(amount);
    if (Number.isNaN(n)) { alert("Geçerli bir sayı girin."); return; }
    const next = [...(group.pending || []), { id: uuid(), amount: n, need }];
    onUpdate(group.id, { pending: next });
    setAmount("");
  };

  const removePending = (pid) => {
    const next = (group.pending || []).filter((p) => p.id !== pid);
    onUpdate(group.id, { pending: next });
  };

  const clearPending = () => onUpdate(group.id, { pending: [] });

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${getGroupStyle(group.color)} dark:border-zinc-700`}>
      <div className="flex items-start gap-2">
        <label className="flex items-center gap-2 select-none">
          <input
            type="checkbox"
            className="size-5 rounded-md border border-zinc-300 dark:border-zinc-700"
            checked={!!group.ticked}
            onChange={(e) => onUpdate(group.id, { ticked: e.target.checked })}
            title="Tiklemek kasayı etkilemez"
          />
          <div>
            <div className="font-semibold leading-tight">
              {group.name || String(group.value)}
              <span className="ml-2 text-xs text-zinc-500">(değer: {fmt(group.value)})</span>
            </div>
            {group.note ? (
              <div className="text-xs text-zinc-500 line-clamp-2 mt-0.5">{group.note}</div>
            ) : (
              <div className="text-xs text-zinc-400 mt-0.5">Not yok</div>
            )}
          </div>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-xl px-2.5 py-1 text-xs border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setEditing(true)}>
            Düzenle
          </button>
          <button className="rounded-xl px-2.5 py-1 text-xs border border-rose-200 text-rose-600 dark:border-rose-900/40 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => onDelete(group.id)}>
            Sil
          </button>
        </div>
      </div>

      {/* Bekleyen giriş ekleme alanı */}
      <div className="mt-3 flex items-center gap-2">
        <input
          inputMode="decimal"
          placeholder="Sayı gir (ör. 70)"
          className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-2 text-sm"
          value={need}
          onChange={(e)=>setNeed(e.target.value)}
        >
          {NEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="rounded-xl px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={addPending}>
          Ekle
        </button>
      </div>

      {/* Bekleyen liste */}
      <div className="mt-2">
        {(group.pending?.length ? group.pending : []).length === 0 ? (
          <div className="text-xs text-zinc-500">Bekleyen giriş yok.</div>
        ) : (
          <div className="text-xs">
            <div className="mb-1 text-zinc-600 dark:text-zinc-300">Bekleyen Girişler:</div>
            <ul className="space-y-1">
              {group.pending.map(p => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>
                    <strong>{fmt(p.amount)}</strong> 
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] border border-zinc-300 dark:border-zinc-700">
                      {p.need}
                    </span>
                  </span>
                  <button className="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={()=>removePending(p.id)}>Sil</button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-2">
              <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={()=>onApplyPending(group.id)}>
                Uygula (Geçmişe İşle)
              </button>
              <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={clearPending}>
                Temizle
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)} title="Grubu Düzenle">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-300">Ad (örn. 150). Ad, isteğe bağlıdır.</label>
              <input
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-300">Atanan sayısal değer</label>
              <input
                inputMode="decimal"
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-300">Not</label>
              <textarea
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={tempNote}
                onChange={(e) => setTempNote(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-300">Renk</label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`px-2 py-1 rounded-lg border ${p.border} ${p.bg} ${p.text} ${p.darkBg} ${p.darkText} ${tempColor === p.key ? "ring-2 ring-zinc-400" : ""}`}
                    onClick={() => setTempColor(p.key)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={submitEdit}>
                Kaydet
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  // Modal açıkken arka plan scroll kilidi
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center">
      {/* Arkaplan */}
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />

      {/* İçerik: Mobilde bottom-sheet, desktop'ta merkez */}
      <div
        className="
          relative mt-auto w-full rounded-t-2xl bg-white dark:bg-zinc-900
          shadow-xl border border-zinc-200 dark:border-zinc-800
          p-4 sm:p-5
          sm:mt-0 sm:rounded-2xl sm:max-w-lg sm:w-full
          max-h-[85svh] overflow-y-auto
        "
      >
        <div className="sticky top-0 -mx-4 -mt-4 sm:-mx-5 sm:-mt-5 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-t-2xl sm:rounded-t-2xl border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold">{title}</div>
            <button
              className="rounded-xl px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={onClose}
            >
              Kapat
            </button>
          </div>
        </div>

        <div className="mt-3">{children}</div>
        <div className="h-2" /> {/* alt nefes payı */}
      </div>
    </div>
  );
}

function HistoryList({ history, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [tempNote, setTempNote] = useState("");
  const [tempNeed, setTempNeed] = useState("gerekli");

  const needColor = (t) =>
    t === "gerekli"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100"
      : t === "fuzuli"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100";

  const startEdit = (h) => {
    setEditingId(h.id);
    setTempNote(h.note || "");
    setTempNeed(h.need || "gerekli");
  };

  const save = () => {
    if (!editingId) return;
    onChange?.(editingId, { note: tempNote, need: tempNeed });
    setEditingId(null);
    setTempNote("");
    setTempNeed("gerekli");
  };

  if (!history?.length) return <div className="text-sm text-zinc-500">Kayıt yok.</div>;

  return (
    <div className="max-h-[60vh] overflow-auto divide-y divide-zinc-100 dark:divide-zinc-800">
      {history.map((h) => (
        <div key={h.id} className="py-2 text-sm">
          <div className="flex items-start gap-3">
            <div className="min-w-28 text-xs text-zinc-500 mt-0.5">{new Date(h.ts).toLocaleString()}</div>
            <div className="flex-1">
              <div className="font-medium">
                {h.groupNameAtTheTime}
                <span className="text-xs text-zinc-500 ml-2">(değer: {fmt(h.groupValueAtTheTime)})</span>
              </div>
              <div className="text-zinc-700 dark:text-zinc-200">
                Etki: ({fmt(h.groupValueAtTheTime)} − {fmt(h.input)}) = {h.delta >= 0 ? "+" : ""}{fmt(h.delta)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${needColor(h.need || "gerekli")}`}>
                  {h.need || "gerekli"}
                </span>
                {h.note ? (
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">Not: {h.note}</span>
                ) : (
                  <span className="text-xs text-zinc-400">Not yok</span>
                )}
              </div>
            </div>
            <div className="ml-auto">
              <button
                className="rounded-xl px-2.5 py-1 text-xs border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => startEdit(h)}
                title="Bu işleme not/etiket ekle-düzenle"
              >
                Düzenle
              </button>
            </div>
          </div>
        </div>
      ))}

      {editingId && (
        <Modal onClose={() => setEditingId(null)} title="İşlem Düzenle">
          <textarea
            className="w-full h-32 p-3 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Bu işleme kısa bir not ekleyin (örn. 'market', 'iade', 'nakit')"
            value={tempNote}
            onChange={(e) => setTempNote(e.target.value)}
          />
          <div className="mt-3 text-sm flex items-center gap-2">
            <span>Etiket:</span>
            <select
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1"
              value={tempNeed}
              onChange={(e) => setTempNeed(e.target.value)}
            >
              {NEED_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setEditingId(null)}>Vazgeç</button>
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={save}>Kaydet</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
