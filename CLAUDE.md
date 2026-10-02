# Instruções do projeto Space

## Preservar o trabalho

- Confira o estado do Git e a branch atual antes de editar.
- Preserve alterações existentes. Não descarte nem reverta trabalho sem instrução explícita.
- Trabalhe em uma branch própria com prefixo `codex/`; não faça commits diretamente em `main`.

## Implementação e validação

- Conclua a implementação solicitada e execute as verificações adequadas à mudança.
- Use `pnpm build` e `pnpm test` para alterações no frontend; `pnpm test:native` para Rust.
- Para interações de interface, execute `pnpm test:ui` com a prévia de produção disponível.
- Diferencie testes locais, interface com operações simuladas, execução nativa e CI do GitHub.
- Preserve revisão explícita antes de remover dados e as validações de identidade, caminhos e pastas protegidas.
- Teste remoções somente com dados temporários criados para esse fim.

## Sempre abrir uma PR ao final

- Toda tarefa que modificar código, documentação, configuração ou testes deve terminar com uma Pull Request no GitHub.
- Após implementar e validar: faça commit, envie a branch e abra uma PR contra `main`, sem aguardar um pedido adicional.
- Se a tarefa já tiver uma PR, atualize essa mesma PR e sua descrição em vez de abrir uma duplicada.
- A PR deve explicar o comportamento resultante, as verificações executadas e qualquer limitação relevante.
- Inclua o link da PR na resposta final. Não declare a tarefa concluída apenas com alterações locais.
- Não faça merge nem publique releases sem autorização explícita do usuário.
- Se houver um impedimento externo para enviar a branch ou criar a PR, preserve o trabalho e informe o impedimento e o que falta.
- Consultas sem alterações no repositório não precisam de PR.
