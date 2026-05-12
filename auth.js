/**
 * NeuralOps - Authentication System
 * Integrates with Supabase for user management
 * Handles login, registration, session management
 */

class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.sessionToken = null;
    this.backendUrl = localStorage.getItem('backendUrl') || 'http://localhost:3001';
    this.loadSession();
  }

  /**
   * Load existing session from localStorage
   */
  loadSession() {
    const savedUser = localStorage.getItem('neuralops_user');
    const savedToken = localStorage.getItem('neuralops_token');
    
    if (savedUser && savedToken) {
      this.currentUser = JSON.parse(savedUser);
      this.sessionToken = savedToken;
      return true;
    }
    return false;
  }

  /**
   * Save session to localStorage
   */
  saveSession(user, token) {
    localStorage.setItem('neuralops_user', JSON.stringify(user));
    localStorage.setItem('neuralops_token', token);
    this.currentUser = user;
    this.sessionToken = token;
  }

  /**
   * Clear session
   */
  clearSession() {
    localStorage.removeItem('neuralops_user');
    localStorage.removeItem('neuralops_token');
    this.currentUser = null;
    this.sessionToken = null;
  }

  /**
   * Register new user
   */
  async register(email, password, name) {
    try {
      const response = await fetch(`${this.backendUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao registrar');
      }

      const data = await response.json();
      this.saveSession(data.user, data.token);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Login user
   */
  async login(email, password) {
    try {
      const response = await fetch(`${this.backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Email ou senha incorretos');
      }

      const data = await response.json();
      this.saveSession(data.user, data.token);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout user
   */
  logout() {
    this.clearSession();
    return { success: true };
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Get auth token
   */
  getToken() {
    return this.sessionToken;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.currentUser && !!this.sessionToken;
  }

  /**
   * Get auth headers for API calls
   */
  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.sessionToken}`
    };
  }

  /**
   * Update backend URL
   */
  setBackendUrl(url) {
    this.backendUrl = url;
    localStorage.setItem('backendUrl', url);
  }

  /**
   * Verify token is still valid
   */
  async verifyToken() {
    if (!this.sessionToken) return false;

    try {
      const response = await fetch(`${this.backendUrl}/api/auth/verify`, {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        return true;
      } else {
        this.clearSession();
        return false;
      }
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }
}

// Global auth instance
const auth = new AuthSystem();
