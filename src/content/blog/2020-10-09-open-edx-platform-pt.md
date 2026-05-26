---
title: "Trabalhando com Open edX: XBlocks Customizados e Deploy com Tutor"
description: "Lições de construir sobre uma das maiores plataformas LMS de código aberto do mundo — internos do Django, desenvolvimento de XBlocks e deploys via Tutor."
pubDate: 2020-10-09
lang: pt-BR
translationKey: open-edx-platform
category: devops
tags: ["python", "django", "open-edx", "docker", "lms"]
draft: false
---

O Open edX é o LMS de código aberto que alimenta o edX.org, o MIT OpenCourseWare e milhares de outras plataformas no mundo todo. É também uma das aplicações Django mais complexas com que você vai trabalhar.

Este post cobre o que aprendi construindo XBlocks customizados e fazendo deploy com Tutor.

## O Que É um XBlock?

XBlocks são a unidade central de conteúdo do Open edX — pense neles como componentes interativos customizados que se plugam no runtime do curso. Um player de vídeo é um XBlock. Um quiz é um XBlock. E quando você precisa de algo customizado — uma simulação, um ambiente de codificação ao vivo, uma ferramenta embutida — você constrói um XBlock.

A API do XBlock é bem definida mas pouco documentada. A melhor forma de entendê-la é ler blocks existentes:

```python
import pkg_resources
from xblock.core import XBlock
from xblock.fields import Integer, Scope, String
from xblock.fragment import Fragment


class CounterXBlock(XBlock):
    """Um block contador simples — útil como exemplo mínimo funcional."""

    count = Integer(
        default=0,
        scope=Scope.user_state,
        help="Quantas vezes o usuário clicou no botão",
    )

    label = String(
        default="Clique aqui",
        scope=Scope.content,
        help="Texto do botão",
    )

    def student_view(self, context=None):
        html = self.resource_string("static/html/counter.html")
        frag = Fragment(html.format(self=self))
        frag.add_css(self.resource_string("static/css/counter.css"))
        frag.add_javascript(self.resource_string("static/js/counter.js"))
        frag.initialize_js("CounterXBlock")
        return frag

    @XBlock.json_handler
    def increment(self, data, suffix=""):
        self.count += 1
        return {"count": self.count}

    @staticmethod
    def workbench_scenarios():
        return [("Counter", "<counter/>")]
```

Pontos essenciais:

- **Scopes** determinam onde os dados são armazenados: `Scope.user_state` é por usuário, `Scope.content` é por instância do block.
- **Views** (`student_view`, `studio_view`) retornam objetos `Fragment` com HTML + JS + CSS.
- **Handlers** são endpoints AJAX decorados com `@XBlock.json_handler`.

## Tutor: A Forma Sã de Fazer Deploy do Open edX

A instalação nativa oficial do Open edX é dolorosa. Tutor é uma ferramenta de deploy baseada em Docker que envolve a complexidade em comandos gerenciáveis:

```bash
# Instale o Tutor
pip install "tutor[full]"

# Inicialize o ambiente
tutor local quickstart

# Crie um usuário admin
tutor local do createuser --staff --superuser admin admin@example.com

# Inicie a plataforma
tutor local start
```

O Tutor usa um sistema de plugins para customizações. Se você precisa substituir um template ou adicionar um pacote pip, você escreve um plugin em vez de modificar o código-fonte do Tutor diretamente:

```python
# myplugin/plugin.py
from tutor import hooks

hooks.Filters.ENV_PATCHES.add_item(
    ("openedx-lms-production-settings", """
FEATURES["ENABLE_COURSEWARE_MICROFRONTEND"] = True
""")
)
```

## O Que Aprendi

Trabalhar com uma base de código dessa escala ensina coisas que você não aprende em projetos simples:

1. **Leia antes de escrever.** O Open edX tem convenções internas fortes. Violações causam bugs sutis difíceis de rastrear.

2. **Mudanças mínimas.** Quanto mais você diverge do upstream, mais difíceis ficam as atualizações. Um patch de 10 linhas que se conecta no ponto de extensão certo supera um override de 200 linhas.

3. **Teste com dados reais.** A plataforma se comporta de forma diferente com conteúdo de curso realista, contagens reais de usuários e assets de vídeo reais. Testes unitários são necessários mas não suficientes.

4. **Docker não é opcional.** Gerenciar o grafo de serviços (LMS, CMS, workers Celery, MySQL, MongoDB, Redis, Elasticsearch) sem containers é um exercício de dor.

A plataforma não é elegante — é uma década de decisões acumuladas, algumas boas e outras não. Mas funciona em escala enorme, e aprender a navegar por ela me tornou um engenheiro melhor.
