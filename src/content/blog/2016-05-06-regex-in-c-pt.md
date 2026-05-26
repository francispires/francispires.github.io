---
title: "Regex em C: Casamento de Padrões POSIX Sem Rede de Proteção"
description: "Usando regex POSIX em C — sem garbage collector, sem exceções, apenas regcomp, regexec e gerenciamento cuidadoso de memória."
pubDate: 2016-05-06
lang: pt-BR
translationKey: regex-in-c
category: misc
tags: ["c", "regex", "posix", "systems-programming"]
draft: false
---

A maioria das linguagens torna regex fácil. Python tem `re.compile`. JavaScript tem `/padrão/flags`. C tem headers POSIX, structs brutas e todo o peso do gerenciamento manual de memória.

Não é uma reclamação. Trabalhar próximo ao metal esclarece o que regex realmente *é* — autômatos finitos compilados operando sobre sequências de bytes.

## A API POSIX de Regex

A regex POSIX em C vive em `<regex.h>` e fornece duas funções principais:

```c
#include <stdio.h>
#include <regex.h>
#include <stdlib.h>

int match(const char *pattern, const char *string) {
    regex_t regex;
    int result;

    /* Compila o padrão */
    result = regcomp(&regex, pattern, REG_EXTENDED);
    if (result != 0) {
        char errbuf[128];
        regerror(result, &regex, errbuf, sizeof(errbuf));
        fprintf(stderr, "regcomp error: %s\n", errbuf);
        return -1;
    }

    /* Executa o match */
    result = regexec(&regex, string, 0, NULL, 0);

    /* Sempre libere a regex compilada */
    regfree(&regex);

    return result == 0 ? 1 : 0;
}

int main(void) {
    printf("%d\n", match("^[0-9]+$", "12345"));   /* 1 */
    printf("%d\n", match("^[0-9]+$", "123ab"));   /* 0 */
    return 0;
}
```

## Grupos de Captura

Para capturar substrings você precisa de `regmatch_t` — um array de structs de match com offsets de início/fim:

```c
#include <stdio.h>
#include <regex.h>
#include <string.h>

void extract_groups(const char *pattern, const char *string, size_t nmatch) {
    regex_t regex;
    regmatch_t matches[nmatch];

    if (regcomp(&regex, pattern, REG_EXTENDED) != 0) {
        fprintf(stderr, "Padrão inválido\n");
        return;
    }

    if (regexec(&regex, string, nmatch, matches, 0) == 0) {
        for (size_t i = 0; i < nmatch; i++) {
            if (matches[i].rm_so == -1) break;

            /* rm_so / rm_eo são offsets de bytes na string de entrada */
            int len = matches[i].rm_eo - matches[i].rm_so;
            printf("Grupo %zu: %.*s\n", i, len, string + matches[i].rm_so);
        }
    }

    regfree(&regex);
}

int main(void) {
    /* Extrai ano, mês, dia de uma data ISO */
    extract_groups(
        "([0-9]{4})-([0-9]{2})-([0-9]{2})",
        "Hoje é 2016-05-06 e amanhã é 2016-05-07.",
        4   /* match completo + 3 grupos */
    );
    return 0;
}
```

Saída:
```
Group 0: 2016-05-06
Group 1: 2016
Group 2: 05
Group 3: 06
```

## O Que Pode Dar Errado

**Esquecer o `regfree`.** Cada `regcomp` aloca estado interno. Omitir o `regfree` vaza memória — silenciosamente, em processos de longa duração.

**Alocar arrays grandes de `regmatch_t` na pilha.** Para padrões com muitos grupos, aloque no heap.

**REG_EXTENDED vs regex básica.** Sem `REG_EXTENDED`, `+`, `?`, `|` e `()` perdem seu significado especial ou exigem escape com barra invertida. Sempre use `REG_EXTENDED` a menos que tenha uma razão específica para não usar.

**Thread safety.** `regcomp` / `regexec` / `regfree` são thread-safe. A struct `regex_t` compilada não é — não a compartilhe entre threads sem mutex.

## Quando Regex em C Faz Sentido

Principalmente quando você já está escrevendo C e precisa de casamento de padrões leve sem incluir PCRE ou outra biblioteca. Para algo mais complexo, use uma linguagem com API de regex mais rica e garbage collection.

Mas entender a API C esclarece semânticas de regex que wrappers de alto nível escondem. `regmatch_t.rm_so` e `rm_eo` são offsets de bytes, não índices de caracteres — uma distinção que importa no momento em que sua entrada contém sequências UTF-8 multibyte.
