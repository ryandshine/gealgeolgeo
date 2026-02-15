import React, { useState } from 'react';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabaseClient';

const Login = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        if (!email || !password) {
            setError('Email dan password harus diisi.');
            return;
        }
        setLoading(true);
        try {
            const { data, error: authError } = await supabase
                .from('users')
                .select('id, email, password')
                .eq('email', email.trim().toLowerCase())
                .eq('password', password)
                .limit(1)
                .single();

            if (authError) {
                console.error('Login error', authError);
                setError('Terjadi kesalahan saat login. Cek konsol.');
                return;
            }

            if (!data) {
                setError('Email atau password tidak cocok.');
                return;
            }

            localStorage.setItem('user', JSON.stringify({ id: data.id, email: data.email }));
            onLoginSuccess?.({ id: data.id, email: data.email });
        } catch (e) {
            console.error('Login exception', e);
            setError('Terjadi kesalahan saat login.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            <div className="w-full max-w-sm bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
                <h1 className="text-white text-3xl font-black mb-1 text-center">GeoAnalyzer</h1>
                <p className="text-slate-400 text-xs uppercase tracking-[0.25em] text-center mb-6">Login</p>
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Email</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                                <Mail size={16} />
                            </div>
                            <input
                                type="email"
                                className="w-full rounded-xl bg-slate-950/70 border border-slate-800 text-slate-200 pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                                placeholder="admin@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Password</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                                <Lock size={16} />
                            </div>
                            <input
                                type="password"
                                className="w-full rounded-xl bg-slate-950/70 border border-slate-800 text-slate-200 pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    {error && (
                        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 text-center">
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-400 text-white font-semibold py-3 text-sm shadow-lg shadow-blue-900/40 hover:from-blue-400 hover:to-blue-300 disabled:opacity-60"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        <span>{loading ? 'Memeriksa...' : 'Masuk'}</span>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
