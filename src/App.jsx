import React, { useEffect, useMemo, useState } from "react";

/**
 * Tek dosyalık React uygulaması (Vite uyumlu)
 * Bu sürümde yenilikler:
 * - Geçmişteki her kayda tıklayıp NOT ekleyebilirsin ("Not Ekle/Düzenle" butonu)
 * - Silme ve kasa sıfırlama için confirm yerine özel modal kullanımı
 * - Export/Import, localStorage kalıcılığı
 */

// ---- Yardımcılar
const STORAGE_KEY = "telefon_harcama_gruplari_v1";
const fmt = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n ?? 0);
const nowISO = () => new Date().toISOString();
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  return [state, setState];
}

// ---- Başlangıç durumu
const starterState = {
  groups: [
    { id: uuid(), name: "150", value: 150, note: "", ticked: false, createdAt: nowISO(), updatedAt: nowISO() },
    { id: uuid(), name: "300", value: 300, note: "", ticked: false, createdAt: nowISO(), updatedAt: nowISO() },
  ],
  history: [],
  lastResetAt: null,
};

export default function App() {
  const [state, setState] = useLocalState(starterState);
  const [showHistory, setShowHistory] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  // Onay modalları
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const total = useMemo(() => state.history.reduce((acc, h) => acc + (h.delta || 0), 0), [state.history]);

  // ---- Grup işlemleri
  const addGroup = () => {
    setState((s) => ({
      ...s,
      groups: [
        ...s.groups,
        { id: uuid(), name: "Yeni Grup", value: 0, note: "", ticked: false, createdAt: nowISO(), updatedAt: nowISO() },
      ],
    }));
  };

  const updateGroup = (id, patch) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: nowISO() } : g)),
    }));
  };

  const confirmDeleteGroup = (id) => setPendingDeleteId(id);
  const doDeleteGroup = () => {
    if (!pendingDeleteId) return;
    setState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== pendingDeleteId) }));
    setPendingDeleteId(null);
  };

  // ---- Geçmiş / kasa
  const pushHistory = ({ group, input }) => {
    const delta = (Number(group.value) || 0) - (Number(input) || 0);
    const rec = {
      id: uuid(),
      ts: nowISO(),
      groupId: group.id,
      groupNameAtTheTime: group.name,
      groupValueAtTheTime: Number(group.value) || 0,
      input: Number(input) || 0,
      delta,
      note: "", // YENİ: geçmiş not alanı
    };
    setState((s) => ({ ...s, history: [rec, ...s.history] }));
  };

  const updateHistoryNote = (id, note) => {
    setState((s) => ({
      ...s,
      history: s.history.map((h) => (h.id === id ? { ...h, note } : h)),
    }));
  };

  const requestResetCommon = () => setShowResetConfirm(true);
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

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
      {/* Üst bar */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-200">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-2">
          <div className="text-xl font-semibold">Ortak Kasa</div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100"
              onClick={() => setShowHistory(true)}
              title="Son sıfırlamadan beri tüm işlemler"
            >
              Toplam: <span className={total >= 0 ? "text-emerald-600" : "text-rose-600"}>{total >= 0 ? "+" : ""}{fmt(total)}</span>
            </button>
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={requestResetCommon}>
              Sıfırla
            </button>
            <div className="w-px h-6 bg-zinc-200" />
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={addGroup}>
              Yeni Grup
            </button>
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={exportJSON}>
              Dışa Aktar
            </button>
            <button className="rounded-2xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={() => setShowImport(true)}>
              İçe Aktar
            </button>
          </div>
        </div>
      </header>

      {/* İçerik */}
      <main className="mx-auto max-w-3xl w-full px-4 py-4">
        <p className="text-sm text-zinc-600 mb-4">
          Kural: Bir gruba sayısal değer girdiğinde, <strong>ortak kasaya etki</strong> = (grup değeri − girilen). Grubu tiklemek yalnızca işaretlemedir; kasayı etkilemez.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {state.groups.map((g) => (
            <GroupCard key={g.id} group={g} onUpdate={updateGroup} onDelete={confirmDeleteGroup} onSubmitInput={pushHistory} />
          ))}
        </div>
      </main>

      {/* Geçmiş paneli */}
      {showHistory && (
        <Modal onClose={() => setShowHistory(false)} title="İşlem Geçmişi (Son Sıfırlamadan Beri)">
          <HistoryList history={state.history} onChangeNote={updateHistoryNote} />
        </Modal>
      )}

      {/* İçe aktarım paneli */}
      {showImport && (
        <Modal onClose={() => setShowImport(false)} title="JSON İçe Aktar">
          <textarea
            className="w-full h-48 p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Buraya JSON yapıştırın"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={importJSON}>
              Aktar
            </button>
          </div>
        </Modal>
      )}

      {/* Silme onayı modalı */}
      {pendingDeleteId && (
        <Modal onClose={() => setPendingDeleteId(null)} title="Grubu Sil">
          <div className="text-sm text-zinc-700">Bu grubu silmek istediğinize emin misiniz?</div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={() => setPendingDeleteId(null)}>Vazgeç</button>
            <button className="rounded-xl px-3 py-1.5 text-sm border border-rose-200 text-rose-600 hover:bg-rose-50" onClick={doDeleteGroup}>Sil</button>
          </div>
        </Modal>
      )}

      {/* Sıfırlama onayı modalı */}
      {showResetConfirm && (
        <Modal onClose={() => setShowResetConfirm(false)} title="Ortak Kasayı Sıfırla">
          <div className="text-sm text-zinc-700">Toplam ve işlem geçmişi sıfırlanacak.</div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={() => setShowResetConfirm(false)}>Vazgeç</button>
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={doResetCommon}>Sıırla</button>
          </div>
        </Modal>
      )}

      <footer className="py-6 text-center text-xs text-zinc-500">Yerel kullanım için — veriler tarayıcıda saklanır.</footer>
    </div>
  );
}

function GroupCard({ group, onUpdate, onDelete, onSubmitInput }) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(group.name);
  const [tempValue, setTempValue] = useState(group.value);
  const [tempNote, setTempNote] = useState(group.note || "");
  const [input, setInput] = useState("");

  useEffect(() => {
    setTempName(group.name);
    setTempValue(group.value);
    setTempNote(group.note || "");
  }, [group.id]);

  const submitEdit = () => {
    const v = Number(tempValue);
    if (Number.isNaN(v)) {
      alert("Geçerli bir sayısal değer girin.");
      return;
    }
    onUpdate(group.id, { name: tempName?.trim() || String(v), value: v, note: tempNote });
    setEditing(false);
  };

  const submitInput = () => {
    const n = Number(input);
    if (Number.isNaN(n)) {
      alert("Geçerli bir sayı girin.");
      return;
    }
    onSubmitInput({ group, input: n });
    setInput("");
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <label className="flex items-center gap-2 select-none">
          <input
            type="checkbox"
            className="size-5 rounded-md border border-zinc-300"
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
          <button className="rounded-xl px-2.5 py-1 text-xs border border-zinc-300 hover:bg-zinc-100" onClick={() => setEditing(true)}>
            Düzenle
          </button>
          <button className="rounded-xl px-2.5 py-1 text-xs border border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(group.id)}>
            Sil
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          inputMode="decimal"
          placeholder="Sayı gir (ör. 170)"
          className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="rounded-xl px-3 py-2 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={submitInput}>
          Uygula
        </button>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)} title="Grubu Düzenle">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-xs text-zinc-600">Ad (örn. 150). Ad, isteğe bağlıdır.</label>
              <input
                className="rounded-xl border border-zinc-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-600">Atanan sayısal değer</label>
              <input
                inputMode="decimal"
                className="rounded-xl border border-zinc-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-zinc-600">Not</label>
              <textarea
                className="rounded-xl border border-zinc-300 px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={tempNote}
                onChange={(e) => setTempNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={submitEdit}>
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
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg sm:rounded-2xl bg-white shadow-xl border border-zinc-200 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-semibold">{title}</div>
          <button className="rounded-xl px-2 py-1 text-xs border border-zinc-300 hover:bg-zinc-100" onClick={onClose}>
            Kapat
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function HistoryList({ history, onChangeNote }) {
  const [editingId, setEditingId] = useState(null);
  const [tempNote, setTempNote] = useState("");

  const startEdit = (h) => {
    setEditingId(h.id);
    setTempNote(h.note || "");
  };
  const saveNote = () => {
    if (!editingId) return;
    onChangeNote?.(editingId, tempNote);
    setEditingId(null);
    setTempNote("");
  };

  if (!history?.length) return <div className="text-sm text-zinc-500">Kayıt yok.</div>;
  return (
    <div className="max-h-[60vh] overflow-auto divide-y divide-zinc-100">
      {history.map((h) => (
        <div key={h.id} className="py-2 text-sm flex items-start gap-3">
          <div className="min-w-28 text-xs text-zinc-500 mt-0.5">{new Date(h.ts).toLocaleString()}</div>
          <div className="flex-1">
            <div className="font-medium">{h.groupNameAtTheTime} <span className="text-xs text-zinc-500">(değer: {fmt(h.groupValueAtTheTime)})</span></div>
            <div className="text-zinc-700">
              Etki: ({fmt(h.groupValueAtTheTime)} − {fmt(h.input)}) = {h.delta >= 0 ? "+" : ""}{fmt(h.delta)}
            </div>
            {h.note ? (
              <div className="text-xs text-zinc-600 mt-1">Not: {h.note}</div>
            ) : (
              <div className="text-xs text-zinc-400 mt-1">Not yok</div>
            )}
          </div>
          <div className="ml-auto">
            <button className="rounded-xl px-2.5 py-1 text-xs border border-zinc-300 hover:bg-zinc-100" onClick={() => startEdit(h)} title="Bu işleme not ekle/düzenle">
              Not Ekle/Düzenle
            </button>
          </div>
        </div>
      ))}

      {editingId && (
        <Modal onClose={() => setEditingId(null)} title="İşlem Notu">
          <textarea
            className="w-full h-32 p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Bu işleme kısa bir not ekleyin (örn. 'market', 'iade', 'nakit')"
            value={tempNote}
            onChange={(e) => setTempNote(e.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={() => setEditingId(null)}>Vazgeç</button>
            <button className="rounded-xl px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100" onClick={saveNote}>Kaydet</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
