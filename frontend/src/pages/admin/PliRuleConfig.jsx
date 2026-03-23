import { useEffect, useState } from 'react';
import { getPliRulesApi, createPliRuleApi, updatePliRuleApi } from '../../api/pliRules.api';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { FINANCIAL_YEARS, getCurrentFinancialYear } from '../../utils/constants';

export default function PliRuleConfig() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ financialYear: getCurrentFinancialYear(), quarter: 'Q1', slabs: [{ minScore: 0, maxScore: 100, payoutPercentage: 100, label: '' }], remarks: '' });

  const loadRules = () => {
    setLoading(true);
    getPliRulesApi().then((res) => setRules(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(() => { loadRules(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ financialYear: getCurrentFinancialYear(), quarter: 'Q1', slabs: [{ minScore: 90, maxScore: 100, payoutPercentage: 100, label: 'Exceptional' }], remarks: '' });
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm({ financialYear: rule.financialYear, quarter: rule.quarter, slabs: [...rule.slabs], remarks: rule.remarks || '' });
    setShowModal(true);
  };

  const addSlab = () => {
    setForm({ ...form, slabs: [...form.slabs, { minScore: 0, maxScore: 0, payoutPercentage: 0, label: '' }] });
  };

  const removeSlab = (idx) => {
    setForm({ ...form, slabs: form.slabs.filter((_, i) => i !== idx) });
  };

  const updateSlab = (idx, field, value) => {
    const slabs = [...form.slabs];
    slabs[idx] = { ...slabs[idx], [field]: field === 'label' ? value : Number(value) };
    setForm({ ...form, slabs });
  };

  const handleSubmit = async () => {
    try {
      if (editing) {
        await updatePliRuleApi(editing._id, { slabs: form.slabs, remarks: form.remarks });
      } else {
        await createPliRuleApi(form);
      }
      toast.success(editing ? 'Updated' : 'Created');
      setShowModal(false);
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="PLI Rule Configuration" actions={<button onClick={openCreate} className="btn-primary">+ Add Rule</button>} />

      <div className="space-y-4">
        {rules.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No PLI rules configured</p>
        ) : (
          rules.map((rule) => (
            <div key={rule._id} className="card">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold">{rule.financialYear} — {rule.quarter}</h4>
                <button onClick={() => openEdit(rule)} className="text-primary-600 text-sm hover:underline">Edit</button>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th className="text-left py-1">Min Score</th>
                    <th className="text-left py-1">Max Score</th>
                    <th className="text-left py-1">Payout %</th>
                    <th className="text-left py-1">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {rule.slabs.map((slab, i) => (
                    <tr key={i}>
                      <td className="py-1">{slab.minScore}</td>
                      <td className="py-1">{slab.maxScore}</td>
                      <td className="py-1 font-medium">{slab.payoutPercentage}%</td>
                      <td className="py-1">{slab.label || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rule.remarks && <p className="text-xs text-gray-400 mt-2">Remarks: {rule.remarks}</p>}
            </div>
          ))
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit PLI Rule' : 'Create PLI Rule'} size="lg">
        {!editing && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label-text">Financial Year</label>
              <select value={form.financialYear} onChange={(e) => setForm({ ...form, financialYear: e.target.value })} className="input-field">
                {FINANCIAL_YEARS.map((fy) => (
                  <option key={fy} value={fy}>FY {fy}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-text">Quarter</label>
              <select value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value })} className="input-field">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="label-text">Score Slabs</label>
            <button onClick={addSlab} className="text-primary-600 text-sm hover:underline">+ Add Slab</button>
          </div>
          {form.slabs.map((slab, idx) => (
            <div key={idx} className="grid grid-cols-5 gap-2 mb-2 items-end">
              <div>
                <input type="number" value={slab.minScore} onChange={(e) => updateSlab(idx, 'minScore', e.target.value)} className="input-field" placeholder="Min" />
              </div>
              <div>
                <input type="number" value={slab.maxScore} onChange={(e) => updateSlab(idx, 'maxScore', e.target.value)} className="input-field" placeholder="Max" />
              </div>
              <div>
                <input type="number" value={slab.payoutPercentage} onChange={(e) => updateSlab(idx, 'payoutPercentage', e.target.value)} className="input-field" placeholder="Payout %" />
              </div>
              <div>
                <input value={slab.label} onChange={(e) => updateSlab(idx, 'label', e.target.value)} className="input-field" placeholder="Label" />
              </div>
              <button onClick={() => removeSlab(idx)} className="text-red-500 text-sm pb-2">Remove</button>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <label className="label-text">Remarks</label>
          <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="input-field" />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSubmit} className="btn-primary">{editing ? 'Update' : 'Create'}</button>
        </div>
      </Modal>
    </div>
  );
}
