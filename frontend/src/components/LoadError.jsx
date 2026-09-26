import { Link } from 'react-router-dom'

export default function LoadError({ message, retry }) {
  return <section className="load-error" role="alert">
    <h2>{message}</h2>
    {retry && <button className="btn-primary" onClick={retry}>Try again</button>}
    <Link className="btn-ghost" to="/">Back to movies</Link>
  </section>
}
