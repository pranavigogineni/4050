const { fail } = require('./security');
function text(value, label, max = 100, required = true) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max ||
      /[\u0000-\u001f\u007f]/.test(value)) fail(`Enter a valid ${label}${required ? '' : ' or leave it blank'}.`);
  return value.trim();
}
function email(value) {
  const result = text(value, 'email address', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('Enter a valid email address.');
  return result;
}
function address(body = {}, prefix = '') {
  const keys = ['street', 'city', 'state', 'zip_code'];
  const values = keys.map(key => text(body[prefix + key], key.replace('_', ' '), key === 'street' ? 200 : 100, false));
  if (values.some(Boolean) && !values.every(Boolean)) fail('Complete all four address fields or leave all of them blank.');
  if (values[3] && !/^\d{5}(-\d{4})?$/.test(values[3])) fail('Enter a ZIP code with 5 digits (or ZIP+4).');
  return values.map(value => value || null);
}
function profile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Enter your profile information.');
  const first = text(body.first_name, 'first name');
  const last = text(body.last_name, 'last name');
  const phone = text(body.phone_number, 'phone number', 30);
  if (!/^[+\d(). -]+$/.test(phone) || phone.replace(/\D/g, '').length < 10 ||
      phone.replace(/\D/g, '').length > 15) fail('Enter a phone number with 10–15 digits.');
  if (typeof body.subscribed_to_promotions !== 'boolean') fail('Choose whether to receive promotions.');
  return [first, last, phone, body.subscribed_to_promotions, ...address(body)];
}
function card(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Enter your card information.');
  const number = text(body.card_number, 'card number', 30).replace(/[ -]/g, '');
  if (!/^\d{13,19}$/.test(number) || /^(\d)\1+$/.test(number)) fail('Enter a valid card number.');
  let sum = 0;
  for (let i = number.length - 1, double = false; i >= 0; i--, double = !double) {
    let digit = Number(number[i]);
    if (double) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  if (sum % 10) fail('Enter a valid card number.');
  const holder = text(body.card_holder_name, 'cardholder name');
  const expiration = text(body.expiration, 'expiration month', 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(expiration)) fail('Choose a valid expiration month.');
  const now = new Date();
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (expiration < current || Number(expiration.slice(0, 4)) > now.getUTCFullYear() + 25) fail('Choose a current or future expiration month.');
  const [year, month] = expiration.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { number, holder, expiration: lastDay, billing: address(body, 'billing_') };
}
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) fail('Item not found.', 404);
  return Number(value);
}
module.exports = { email, profile, card, id };
