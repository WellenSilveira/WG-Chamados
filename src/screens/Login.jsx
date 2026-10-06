import { useState } from "react";
import appLogo from "../assets/atom (2).png";
import { loadLocalDatabase } from "../lib/db.js";

const REMEMBERED_CPF_KEY = "wg-chamados-remembered-cpf";

function formatarCPF(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function Login({ onLogin, onGoToCadastro }) {
  const [cpf, setCpf] = useState(() => {
    const rememberedCpf = localStorage.getItem(REMEMBERED_CPF_KEY) ?? "";
    return formatarCPF(rememberedCpf);
  });
  const [rememberLogin, setRememberLogin] = useState(() =>
    (localStorage.getItem(REMEMBERED_CPF_KEY) ?? "").replace(/\D/g, "").length === 11
  );
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (entrando) return;

    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      setErro("Informe um CPF com 11 dígitos.");
      return;
    }
    if (!senha) {
      setErro("Informe sua senha.");
      return;
    }

    setErro("");
    setEntrando(true);
    try {
      const database = await loadLocalDatabase();
      const usuario = (database.users ?? []).find(
        (item) => (item.cpf ?? "").replace(/\D/g, "") === cpfLimpo
      );

      if (!usuario) {
        setErro("CPF ou senha inválidos. Confira seus dados ou solicite acesso ao administrador.");
        return;
      }
      if (usuario.status === "PENDENTE" || usuario.profile === "Pendente") {
        setErro("Seu cadastro aguarda a definição de perfil pelo administrador.");
        return;
      }
      if (usuario.status === "BLOQUEADO") {
        setErro("Esta conta está bloqueada. Entre em contato com o administrador.");
        return;
      }
      if (usuario.status === "RECUSADO") {
        setErro("Este cadastro não foi aprovado. Entre em contato com o administrador.");
        return;
      }
      if (usuario.senha !== senha) {
        setErro("CPF ou senha inválidos. Tente novamente.");
        return;
      }

      if (rememberLogin) {
        localStorage.setItem(REMEMBERED_CPF_KEY, cpfLimpo);
      } else {
        localStorage.removeItem(REMEMBERED_CPF_KEY);
      }
      await onLogin(usuario);
    } catch (error) {
      console.error("Erro ao entrar no WG Chamados:", error);
      setErro("Não foi possível acessar os dados locais. Tente novamente.");
    } finally {
      setEntrando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#2a7b7e] p-6">
      <section className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img
            src={appLogo}
            alt="WG Chamados"
            className="mx-auto mb-4 h-[90px] w-[80px] object-contain"
          />
          <h1 className="mb-1 text-xl font-bold text-cyan-50">
            Entrar no sistema
          </h1>
          <p className="text-sm text-cyan-50">
            Autenticação local — sem necessidade de internet.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-cpf" className="text-cyan-50">
              CPF
            </label>
            <input
              id="login-cpf"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              maxLength={14}
              required
              placeholder="000.000.000-00"
              value={cpf}
              className="w-full rounded border bg-white px-3 py-2.5"
              onChange={(event) => setCpf(formatarCPF(event.target.value))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-senha" className="text-cyan-50">
              Senha
            </label>
            <input
              id="login-senha"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Sua senha"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              className="w-full rounded border bg-white px-3 py-2.5"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-cyan-50">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(event) => setRememberLogin(event.target.checked)}
              className="h-4 w-4 accent-slate-800"
            />
            Lembrar login neste dispositivo (salva apenas o CPF)
          </label>

          {erro && (
            <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={entrando}
            className="w-full rounded bg-slate-800 py-2.5 text-white disabled:cursor-wait disabled:opacity-70"
          >
            {entrando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <button
          type="button"
          onClick={onGoToCadastro}
          className="mt-3 w-full rounded bg-slate-800 py-2.5 text-white"
        >
          Criar conta
        </button>
      </section>
    </main>
  );
}
