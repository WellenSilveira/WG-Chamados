import React, { useState } from "react";
import appLogo from "../assets/atom (2).png";

function formatarCPF(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function Cadastro({ onSaved, onGoToLogin, departments = [], firstRun = false }) {
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#2a7b7e] p-6">
      <section className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img
            src={appLogo}
            alt="WG Chamados"
            className="mx-auto mb-4 w-[80px] h-[90px] object-contain"
          />

          <h1 className="mb-1 text-xl font-bold text-mauve-50">{firstRun ? "Configurar administrador" : "Criar conta"}</h1>
          <p className="text-sm text-cyan-50">
            {firstRun
              ? "Crie a conta de administrador para começar a configurar o aplicativo."
              : "Autenticação local — sem necessidade de internet."}
          </p>
        </div>

        {enviado ? (
          <div className="rounded border border-emerald-200 bg-white p-4 text-center">
            <h2 className="font-semibold text-slate-800">{firstRun ? "Administrador criado" : "Cadastro enviado"}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {firstRun ? "Sua sessão será iniciada com a conta de administrador." : "Aguarde o administrador definir seu perfil para liberar o acesso."}
            </p>
            {!firstRun && <button type="button" onClick={onGoToLogin} className="mt-4 w-full rounded bg-slate-800 py-2.5 text-white">
              Voltar ao login
            </button>}
          </div>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const data = Object.fromEntries(new FormData(event.currentTarget));
              if (data.cpf.replace(/\D/g, "").length !== 11) {
                setErro("Informe um CPF com 11 dígitos.");
                return;
              }
              if (firstRun && senha !== confirmarSenha) {
                setErro("A confirmação de senha não corresponde.");
                return;
              }
              if (firstRun) {
                data.password = senha;
                data.confirmPassword = confirmarSenha;
              }
              const saveError = await onSaved(data);
              if (saveError) {
                setErro(saveError);
                return;
              }
              setErro("");
              if (!firstRun) setEnviado(true);
            }}
            className="flex flex-col gap-4"
          >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nome" className="text-cyan-50">
              Nome completo
            </label>
            <input
              id="nome"
              name="nome"
              type="text"
              required
              placeholder="Seu nome completo"
              className="w-full rounded border bg-white px-3 py-2.5"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cpf" className="text-cyan-50">
              CPF
            </label>
            <input
              id="cpf"
              name="cpf"
              type="text"
              inputMode="numeric"
              maxLength={14}
              required
              placeholder="000.000.000-00"
              className="w-full rounded border bg-white px-3 py-2.5"
              onChange={(event) => {
                event.target.value = formatarCPF(event.target.value);
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="E-mail" className="text-cyan-50">
              E-mail
            </label>
            <input
              id="E-mail"
              name="email"
              type="email"
              required
              placeholder="seu.email@dominio.com"
              className="w-full rounded border bg-white px-3 py-2.5"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="setor" className="text-cyan-50">
              Setor
            </label>
            <select id="setor" name="setor" required defaultValue="" className="w-full rounded border bg-white px-3 py-2.5">
              <option value="" disabled>Selecione seu setor</option>
              {(departments.length ? departments : ["Setores ainda não cadastrados"]).map((department) => <option key={department} disabled={department === "Setores ainda não cadastrados"}>{department}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cargo" className="text-cyan-50">
              Cargo
            </label>
            <input
              id="cargo"
              name="cargo"
              type="text"
              required
              placeholder="Seu cargo"
              className="w-full rounded border bg-white px-3 py-2.5"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="dataAniversario" className="text-cyan-50">
              Data de aniversário
            </label>
            <input
              id="dataAniversario"
              name="dataAniversario"
              type="date"
              required
              className="w-full rounded border bg-white px-3 py-2.5"
            />
          </div>

          {firstRun && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="senha-admin" className="text-cyan-50">Senha do administrador</label>
                <input
                  id="senha-admin"
                  type="password"
                  minLength={8}
                  required
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded border bg-white px-3 py-2.5"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirmar-senha-admin" className="text-cyan-50">Confirmar senha</label>
                <input
                  id="confirmar-senha-admin"
                  type="password"
                  minLength={8}
                  required
                  value={confirmarSenha}
                  onChange={(event) => setConfirmarSenha(event.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded border bg-white px-3 py-2.5"
                />
              </div>
            </>
          )}

          {erro && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded bg-slate-800 py-2.5 text-white"
          >
            {firstRun ? "Criar administrador" : "Salvar"}
          </button>
          </form>
        )}
      </section>
    </main>
  );
}
