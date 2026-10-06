const defaultCategories = ["Hardware", "Software", "Acesso", "Rede"];
const defaultPriorities = ["Baixa", "Média", "Alta", "Crítica"];
const defaultDepartments = ["Administrativo", "Financeiro", "Recursos Humanos", "Recepção"];

export default function AbrirChamado({ onCancel, onSubmit, settings = {}, user = {}, initialValues = {} }) {
  const categories = Array.isArray(settings.categories)
    ? settings.categories.filter((category) => category.active).map((category) => category.name)
    : defaultCategories;
  const priorities = settings.priorities?.length ? settings.priorities.map((priority) => priority.name) : defaultPriorities;
  const departments = settings.departments?.length ? settings.departments : defaultDepartments;
  const ticketCategories = categories;
  return (
    <section className="min-h-full bg-slate-100">
      <header className="border-b border-slate-300 bg-slate-200/60 px-4 py-3 sm:px-6">
        <h1 className="text-sm font-semibold text-slate-800">Abrir Chamado</h1>
        <p className="mt-1 text-[9.6px] uppercase tracking-widest text-slate-500">
          Preencha os dados do chamado
        </p>
      </header>

      <form
        className="max-w-134.5 space-y-4 p-4 sm:p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          await onSubmit?.(Object.fromEntries(new FormData(form)));
          form.reset();
          onCancel?.();
        }}
      >
        <div>
          <label
            htmlFor="titulo-chamado"
            className="mb-1 block text-[10.8px] font-medium uppercase tracking-wide text-sky-800"
          >
            Título do chamado <span className="text-red-500">*</span>
          </label>
          <input
            id="titulo-chamado"
            name="title"
            type="text"
            required
            defaultValue={initialValues.title ?? ""}
            placeholder="Descreva o problema resumidamente..."
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-sky-700"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Categoria" required>
            <select
              name="category"
              defaultValue={initialValues.category ?? ""}
              required
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-sky-700"
            >
              <option value="" disabled>
                {ticketCategories.length ? "Selecionar..." : "Nenhuma categoria ativa"}
              </option>
              {ticketCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="Prioridade" required>
            <select
              name="priority"
              defaultValue={initialValues.priority ?? ""}
              required
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-sky-700"
            >
              <option value="" disabled>
                Selecionar...
              </option>
              {priorities.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </Field>
          <Field label="Departamento">
            <select
              name="department"
              defaultValue={initialValues.department ?? ""}
              required
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-sky-700"
            >
              <option value="" disabled>
                Selecionar...
              </option>
              {departments.map((department) => <option key={department}>{department}</option>)}
            </select>
          </Field>
          <Field label="Ramal ou telefone">
            <input
              name="requesterPhone"
              type="tel"
              readOnly
              value={user.telefone ?? ""}
              placeholder="Cadastre no Meu Perfil"
              className="w-full rounded border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs text-slate-600"
            />
          </Field>
          <Field label="Local (sala)">
            <input
              name="requesterLocation"
              type="text"
              readOnly
              value={user.local ?? ""}
              placeholder="Cadastre no Meu Perfil"
              className="w-full rounded border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs text-slate-600"
            />
          </Field>
          <Field label="Ativo vinculado (opcional)">
            <input
              name="assetId"
              type="text"
              placeholder="Informe o número de patrimônio, se houver"
              className="w-full rounded border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none focus:border-sky-700"
            />
          </Field>
        </div>

        <div>
          <label
            htmlFor="descricao-chamado"
            className="mb-1 block text-[10.8px] font-medium uppercase tracking-wide text-sky-800"
          >
            Descrição detalhada <span className="text-red-500">*</span>
          </label>
          <textarea
            id="descricao-chamado"
          name="description"
          required
            defaultValue={initialValues.description ?? ""}
            rows="5"
            placeholder="Descreva o problema com detalhes: quando começou, o que foi tentado, mensagens de erro recebidas..."
            className="w-full resize-y rounded border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-sky-700"
          />
        </div>

        <div className="rounded border border-slate-300 bg-slate-200/60 px-3 py-3 text-[10.8px] text-slate-600">
          <p className="font-mono uppercase tracking-widest text-slate-700">
            ⓘ &nbsp; SLA ativo após abertura do chamado
          </p>
          <p className="mt-1 pl-5">
            {priorities.map((priorityName) => {
              const priority = settings.priorities?.find((item) => item.name === priorityName);
              return `${priorityName}: ${priority?.resolutionHours ?? 24}h`;
            }).join(" · ")}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-xs text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="rounded bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800"
          >
            Enviar
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-[10.8px] font-medium uppercase tracking-wide text-sky-800">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
