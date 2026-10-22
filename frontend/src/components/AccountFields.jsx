export const emptyProfile = {
  first_name: '', last_name: '', phone_number: '', subscribed_to_promotions: false,
  street: '', city: '', state: '', zip_code: '',
}
export const emptyCard = {
  card_number: '', card_holder_name: '', expiration: '',
  billing_street: '', billing_city: '', billing_state: '', billing_zip_code: '',
}
export function Field({ label, name, value, onChange, required = false, ...props }) {
  return <label className="account-field">
    <span>{label}{required && <span aria-hidden="true"> *</span>}</span>
    <input name={name} aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value)} required={required} {...props} />
  </label>
}
export function AddressFields({ value, setValue, billing = false }) {
  const prefix = billing ? 'billing_' : ''
  const active = ['street', 'city', 'state', 'zip_code'].some(key => value[prefix + key])
  return <fieldset>
    <legend>{billing ? 'Billing address' : 'Home address'} <span className="muted">(optional)</span></legend>
    <p className="form-help">If you add an address, complete all four fields. One address can be saved here.</p>
    <div className="form-grid">
      {[['street', 'Street address', 'address-line1'], ['city', 'City', 'address-level2'], ['state', 'State', 'address-level1'], ['zip_code', 'ZIP code', 'postal-code']].map(([key, label, autoComplete]) =>
        <Field key={key} name={prefix + key} label={label} value={value[prefix + key]} required={Boolean(active)}
          autoComplete={`${billing ? 'billing' : 'shipping'} ${autoComplete}`} maxLength={key === 'street' ? 200 : 100}
          pattern={key === 'zip_code' ? '[0-9]{5}(-[0-9]{4})?' : undefined}
          onChange={v => setValue({ ...value, [prefix + key]: v })} />)}
    </div>
  </fieldset>
}
export function ProfileFields({ value, setValue }) {
  return <>
    <div className="form-grid">
      <Field name="first_name" label="First name" autoComplete="given-name" maxLength={100} value={value.first_name} required onChange={v => setValue({ ...value, first_name: v })} />
      <Field name="last_name" label="Last name" autoComplete="family-name" maxLength={100} value={value.last_name} required onChange={v => setValue({ ...value, last_name: v })} />
      <Field name="phone_number" label="Phone number" type="tel" autoComplete="tel" maxLength={30} value={value.phone_number} required onChange={v => setValue({ ...value, phone_number: v })} />
    </div>
    <AddressFields value={value} setValue={setValue} />
    <label className="check-field"><input type="checkbox" checked={value.subscribed_to_promotions} onChange={e => setValue({ ...value, subscribed_to_promotions: e.target.checked })} />Send me movie news and promotions</label>
  </>
}
export function CardFields({ value, setValue }) {
  return <>
    <p className="form-help">Your card number is encrypted before storage. Only the last four digits are displayed. We never store a security code.</p>
    <div className="form-grid">
      <Field name="card_number" label="Card number" inputMode="numeric" autoComplete="cc-number" maxLength={30} required value={value.card_number} onChange={v => setValue({ ...value, card_number: v })} />
      <Field name="card_holder_name" label="Cardholder name" autoComplete="cc-name" maxLength={100} required value={value.card_holder_name} onChange={v => setValue({ ...value, card_holder_name: v })} />
      <Field name="expiration" label="Expiration month" type="month" autoComplete="cc-exp" required value={value.expiration} onChange={v => setValue({ ...value, expiration: v })} />
    </div>
    <AddressFields value={value} setValue={setValue} billing />
  </>
}
export function PasswordFields({ value, setValue, current = false }) {
  const helpId = useId()
  const matchId = useId()
  const fieldsRef = useRef(null)
  const password = value.password ?? ''
  const confirmation = value.confirm_password ?? ''
  const requirements = [
    ['12–128 characters', password.length >= 12 && password.length <= 128],
    ['An uppercase letter (A–Z)', /[A-Z]/.test(password)],
    ['A lowercase letter (a–z)', /[a-z]/.test(password)],
    ['A number (0–9)', /[0-9]/.test(password)],
    ['A symbol (e.g. !, @, #)', /[^A-Za-z0-9]/.test(password)],
  ]
  const valid = requirements.every(([, met]) => met)
  const matches = Boolean(confirmation) && password === confirmation
  useEffect(() => {
    fieldsRef.current.querySelector('[name="password"]').setCustomValidity(valid ? '' : 'Complete the password requirements below.')
    fieldsRef.current.querySelector('[name="confirm_password"]').setCustomValidity(confirmation && !matches ? 'Passwords must match.' : '')
  }, [valid, confirmation, matches])
  return <>
    {current && <Field name="current_password" label="Current password" type="password" autoComplete="current-password" required maxLength={128} value={value.current_password} onChange={v => setValue({ ...value, current_password: v })} />}
    <div className="form-grid" ref={fieldsRef}>
      <div>
        <Field name="password" label={current ? 'New password' : 'Password'} type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby={helpId} value={password} onChange={v => setValue({ ...value, password: v })} />
        <ul id={helpId} className="password-requirements" aria-label="Password requirements" aria-live="polite" aria-atomic="true">
          {requirements.map(([label, met]) => <li key={label} className={met ? 'met' : ''}>
            <span aria-label={met ? 'Met:' : 'Needed:'}>{met ? '✓' : '○'}</span> {label}
          </li>)}
        </ul>
      </div>
      <div>
        <Field name="confirm_password" label="Confirm password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby={matchId} value={confirmation} onChange={v => setValue({ ...value, confirm_password: v })} />
        <p id={matchId} className={`password-match${confirmation ? matches ? ' met' : ' mismatch' : ''}`} aria-live="polite">
          {confirmation ? matches ? '✓ Passwords match' : 'Passwords do not match yet' : 'Re-enter your password to confirm it.'}
        </p>
      </div>
    </div>
  </>
}
export function Notice({ error, message }) {
  const errorRef = useRef(null)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  return <>{error && <p ref={errorRef} tabIndex={-1} className="form-notice error" role="alert">{error}</p>}{message && <p className="form-notice success" role="status">{message}</p>}</>
}
import { useEffect, useId, useRef } from 'react'
