import { useEffect, useState } from 'react'
import { accountApi } from '../api/account'
import { Field, Notice } from '../components/AccountFields'

const empty = { promo_code: '', description: '', discount_percent: '', start_date: '', end_date: '' }
export default function PromotionPanel() {
  const [form, setForm] = useState(empty)
  const [promotions, setPromotions] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    try { setPromotions(await accountApi('/admin/promotions')) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const change = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  async function submit(e) {
    e.preventDefault(); setError(''); setMessage('')
    if (form.end_date < form.start_date) { setError('End date must be on or after the start date.'); return }
    setBusy(true)
    try {
      const result = await accountApi('/admin/promotions', { method: 'POST', body: form })
      setMessage(result.message); setForm(empty); await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <>
    <Notice error={error} message={message} />
    <form onSubmit={submit}>
      <p className="form-help">Fields marked * are required. Creating a promotion emails active customers who opted into promotions. Dates are in Eastern Time.</p>
      <div className="form-grid">
        <Field label="Promotion code" required maxLength={30} pattern="[A-Za-z0-9_\-]+" title="Letters, numbers, underscores and hyphens only" value={form.promo_code} onChange={v => change('promo_code', v.toUpperCase())} />
        <Field label="Discount percent" type="number" required min="0.01" max="100" step="0.01" value={form.discount_percent} onChange={v => change('discount_percent', v)} />
        <Field label="Promotion start date" type="date" required value={form.start_date} onChange={v => change('start_date', v)} />
        <Field label="Promotion end date" type="date" required min={form.start_date || undefined} value={form.end_date} onChange={v => change('end_date', v)} />
      </div>
      <label className="account-field"><span>Description *</span><textarea aria-label="Promotion description" required maxLength={2000} rows={3} value={form.description} onChange={e => change('description', e.target.value)} /></label>
      <button className="btn-primary" disabled={busy}>{busy ? 'Creating promotion…' : 'Create promotion and email subscribers'}</button>
      <p className="form-help">Emails are queued for delivery. Delivery requires the cinema’s email service to be configured.</p>
    </form>
    <h3>Saved promotions</h3>
    {loading ? <p role="status">Loading promotions…</p> : promotions.length ? <div className="order-table-wrap"><table className="order-table"><thead><tr><th>Code</th><th>Description</th><th>Discount</th><th>Valid dates</th></tr></thead><tbody>{promotions.map(p => <tr key={p.id}><td>{p.promo_code}</td><td>{p.description}</td><td>{p.discount_percent}%</td><td>{p.start_date} – {p.end_date}</td></tr>)}</tbody></table></div> : <p>No promotions yet.</p>}
    {error && <button className="btn-ghost" onClick={() => { setError(''); load() }}>Reload promotions</button>}
  </>
}
