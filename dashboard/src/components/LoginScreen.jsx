import { useState } from 'react';

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const ok = onLogin(password);
    if (!ok) {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">The Traffic Bureau</h1>
          <p className="text-slate-400 text-sm mt-1">Highway 99 · Sea to Sky corridor</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              placeholder="Enter password"
              className={`w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${
                error ? 'ring-2 ring-red-500' : 'focus:ring-blue-500'
              }`}
              autoFocus
            />
            {error && <p className="text-red-400 text-xs mt-1.5">Incorrect password</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
          >
            Sign in
          </button>
        </form>
        <p className="text-center text-xs text-slate-600 mt-6">
          Field Trip Management Ltd.
        </p>
      </div>
    </div>
  );
}
