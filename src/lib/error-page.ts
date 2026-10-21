export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>armaZen — Não foi possível carregar</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; font-family: "IBM Plex Sans", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { font: 15px/1.6 "IBM Plex Sans", system-ui, sans-serif; background: #f7f7fa; color: #202238; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 30rem; width: 100%; text-align: center; padding: 2.25rem; background: #fff; border: 1px solid #e4e6ef; border-radius: 1rem; box-shadow: 0 16px 40px rgb(25 30 80 / 8%); }
      .mark { display: grid; place-items: center; width: 3.25rem; height: 3.25rem; margin: 0 auto 1.25rem; border-radius: .875rem; background: #404890; color: white; font-weight: 700; letter-spacing: -.04em; }
      h1 { font-size: 1.35rem; line-height: 1.3; margin: 0 0 .5rem; }
      p { color: #5c6077; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: .6rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: .65rem 1rem; border-radius: .55rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #404890; color: #fff; }
      .primary:hover { background: #343c7b; }
      .secondary { background: #fff; color: #30365f; border-color: #cfd3e5; }
      .secondary:hover { background: #f0f1fa; }
      a:focus-visible, button:focus-visible { outline: 3px solid #8f97df; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="mark" aria-hidden="true">aZ</div>
      <h1>Não foi possível carregar o armaZen</h1>
      <p>Ocorreu um erro inesperado. Tente carregar a página novamente ou volte ao início.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar novamente</button>
        <a class="secondary" href="/">Voltar ao início</a>
      </div>
    </main>
  </body>
</html>`;
}
