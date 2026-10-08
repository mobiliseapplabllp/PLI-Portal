/**
 * ClientOrgImportModal — Excel import for Client Organisations.
 * 1. Download template  2. Choose file → server validates (writes nothing)
 * 3. Preview: valid rows green, rows with errors red + reason  4. Import valid rows.
 * The server re-validates on import, so the preview is advice, not the guard.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlineDownload, HiOutlineUpload } from 'react-icons/hi';
import {
  getClientOrgImportTemplateApi, validateClientOrgImportApi, commitClientOrgImportApi,
} from '../../api/csat.api';

const errMsg = (err, fallback) =>
  err?.response?.data?.message || err?.response?.data?.error?.message || fallback;

export default function ClientOrgImportModal({ open, onClose, onImported }) {
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);   // { rows, totalRows, validCount, errorCount }
  const [checking, setChecking]   = useState(false);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const reset = () => { setFile(null); setPreview(null); };
  const close = () => { reset(); onClose(); };

  const downloadTemplate = async () => {
    try {
      const res = await getClientOrgImportTemplateApi();
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url; a.download = 'client_organisations_template.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(errMsg(err, 'Could not download the template')); }
  };

  const check = async (f) => {
    setFile(f); setPreview(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { toast.error('Choose an Excel file (.xlsx)'); return; }
    setChecking(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await validateClientOrgImportApi(fd);
      setPreview(res.data?.data ?? null);
    } catch (err) {
      toast.error(errMsg(err, 'Could not read the file'));
      setFile(null);
    } finally { setChecking(false); }
  };

  const doImport = async () => {
    if (!preview?.validCount) return;
    setImporting(true);
    try {
      const res = await commitClientOrgImportApi(preview.rows);
      const r = res.data?.data || {};
      toast.success(`Imported ${r.inserted ?? 0} organisation(s)${r.skipped ? ` · skipped ${r.skipped}` : ''}`);
      reset();
      onImported?.();
      onClose();
    } catch (err) { toast.error(errMsg(err, 'Import failed — nothing was saved')); }
    finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Import Client Organisations</h2>
          <button onClick={close} className="p-1 rounded text-gray-400 hover:text-gray-700" aria-label="Close">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-auto">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
              <HiOutlineDownload className="w-4 h-4" /> Download template
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 cursor-pointer">
              <HiOutlineUpload className="w-4 h-4" /> {file ? 'Choose another file' : 'Choose Excel file'}
              <input type="file" accept=".xlsx" className="hidden" onChange={e => { check(e.target.files?.[0] || null); e.target.value = ''; }} />
            </label>
            {file && <span className="text-xs text-gray-500 truncate max-w-[16rem]">{file.name}</span>}
          </div>
          <p className="text-xs text-gray-500">
            Columns: <strong>Name</strong> (required), Industry, Description, Managed By (a user's email).
            Names that already exist, or appear twice in the file, are skipped.
          </p>

          {checking && <p className="text-sm text-gray-500">Checking the file…</p>}

          {preview && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">{preview.totalRows} rows</span>
                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">{preview.validCount} ready to import</span>
                {preview.errorCount > 0 && <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">{preview.errorCount} with errors — will be skipped</span>}
              </div>
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Industry</th>
                      <th className="px-3 py-2 text-left">Managed By</th>
                      <th className="px-3 py-2 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.rows.map(r => (
                      <tr key={r.rowNumber} className={r.valid ? '' : 'bg-red-50/60'}>
                        <td className="px-3 py-2 text-gray-400">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{r.name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.industry || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.managedByName || r.managedByEmail || '—'}</td>
                        <td className="px-3 py-2">
                          {r.valid
                            ? <span className="text-emerald-700 font-medium">Ready</span>
                            : <span className="text-red-600">{r.errors.join('; ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={close} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            onClick={doImport}
            disabled={!preview?.validCount || importing}
            className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${preview?.validCount ?? 0} organisation${preview?.validCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
