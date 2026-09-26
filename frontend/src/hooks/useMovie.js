import { useEffect, useState } from 'react'
import { fetchMovie } from '../api/movies'

export default function useMovie(id) {
  const [state, setState] = useState({ movie: null, loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setState({ movie: null, loading: true, error: '' })
    fetchMovie(id).then(movie => {
      if (active) setState({ movie, loading: false, error: '' })
    }).catch(error => {
      if (active) setState({ movie: null, loading: false, error: error.response?.status === 404
        ? 'Movie not found.' : 'Unable to load this movie. Please try again.' })
    })
    return () => { active = false }
  }, [id, attempt])
  return { ...state, retry: () => setAttempt(value => value + 1) }
}
