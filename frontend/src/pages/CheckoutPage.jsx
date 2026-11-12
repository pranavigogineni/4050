import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { accountApi } from '../api/account'
import { Field, Notice } from '../components/AccountFields'
import { draftKey, readDraft } from './BookingPage'
import './AccountPages.css'

export default function CheckoutPage({ payment = false }) {
  const { showId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft] = useState(() => readDraft(showId))
  useEffect(() => {
    let active = true
    if (!draft.tickets?.length) { setError('Your selection is empty. Choose a showtime and seats first.'); return }
    accountApi(payment ? '/checkout/payment' : '/checkout/summary', { method: 'POST', body: draft }).then(result => {
      if (active) { setOrder(result); setEmail(draft.email || result.email) }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [draft, payment])
  async function confirm(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const confirmed = await accountApi('/checkout/payment', { method: 'POST', body: { ...draft, email } })
      sessionStorage.setItem(draftKey(showId), JSON.stringify({ ...draft, email: confirmed.email }))
      navigate(`/payment/${showId}`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <main className="account-page"><div className="account-heading"><span className="eyebrow">YOUR MOVIE NIGHT</span><h1>{payment ? 'Payment processing' : 'Order summary'}</h1><p>{payment ? 'Payment preview' : 'Review your seats, tickets, and email before continuing.'}</p></div>
    <Notice error={error} />
    {!order && !error && <p role="status">Loading your order…</p>}
    {order && <section className="account-panel"><h2>{order.show.title}</h2><p>{order.show.date} · {order.show.time.slice(0, 5)} Eastern Time · {order.show.showroom}</p>
      <div className="order-table-wrap"><table className="order-table"><caption>{order.tickets.length} ticket{order.tickets.length !== 1 ? 's' : ''}</caption><thead><tr><th>Seat</th><th>Ticket type</th><th>Price per ticket</th></tr></thead><tbody>{order.tickets.map(t => <tr key={t.seat_id}><td>{t.seat}</td><td>{t.type}</td><td>${t.price}</td></tr>)}</tbody></table></div>
      <p className="order-total"><strong>Total before tax</strong><strong>${order.subtotal}</strong></p>
      {payment ? <><p>Confirmation email: <strong>{order.email}</strong></p><div className="payment-preview"><h2>Payment mockup</h2><p>Payment processing and final booking confirmation will be available in the final demo. No payment is collected and no purchase has been made.</p><button className="btn-primary" disabled>Pay now — coming in the final demo</button></div><Link to={`/checkout/${showId}`}>Back to order summary</Link></> :
        <form onSubmit={confirm}><Field label="Confirmation email" type="email" maxLength={254} required value={email} onChange={setEmail} /><p className="form-help">Confirm your account email or enter a different address for this order. Your profile email stays the same.</p><button className="btn-primary" disabled={busy}>{busy ? 'Checking your order…' : 'Confirm and continue to payment'}</button></form>}
      <div className="form-links"><Link to={`/booking/${order.show.movie_id}/${showId}`}>Change seats or tickets</Link></div>
    </section>}
    {!order && error && <Link to="/">Back to movies</Link>}
  </main>
}
