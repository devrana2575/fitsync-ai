import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const inflightGets = new Map();
const originalGet = api.get.bind(api);

api.get = (url, config = {}) => {
  const key = `GET:${url}:${JSON.stringify(config.params || {})}`;
  if (inflightGets.has(key)) return inflightGets.get(key);
  const request = originalGet(url, config).finally(() => inflightGets.delete(key));
  inflightGets.set(key, request);
  return request;
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const status = error.response?.status;
    const serverMessage = error.response?.data?.message;
    let message = serverMessage;
    if (!message) {
      if (status === 400) message = 'The request was invalid. Please check the details and try again.';
      else if (status === 401) message = 'Your session has expired. Please log in again.';
      else if (status === 403) message = 'You do not have permission to perform this action.';
      else if (status === 404) message = 'The requested item was not found.';
      else if (status === 429) message = 'Too many requests. Please wait a moment and try again.';
      else if (status >= 500) message = 'Something went wrong on our end. Please try again in a moment.';
      else message = error.message || 'An error occurred';
    }
    return Promise.reject(new Error(message));
  }
);

export default api;
