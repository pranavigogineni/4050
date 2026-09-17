import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const fetchMovies  = (params = {}) => api.get('/movies', { params }).then(r => r.data)
export const fetchMovie   = (id)           => api.get(`/movies/${id}`).then(r => r.data)
export const fetchGenres  = ()             => api.get('/genres').then(r => r.data)
