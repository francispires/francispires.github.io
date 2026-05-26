---
title: "Funções de Janela SQL: O Recurso Que Mudou Como Escrevo Queries"
description: "Um guia prático para OVER(), PARTITION BY e as famílias de funções de agregação/ranking/valor — com casos de uso reais para análise de dados."
pubDate: 2024-01-15
lang: pt-BR
translationKey: sql-window-functions
category: sql
tags: ["sql", "analytics", "data-engineering", "postgresql"]
draft: false
---

Se você ainda está usando subqueries ou self-joins para calcular totais acumulados, rankings ou comparações período a período — funções de janela vão mudar sua vida.

Estão disponíveis no PostgreSQL, DuckDB, BigQuery, Snowflake, SQLite (3.25+), SQL Server e MySQL 8+. Aprenda uma vez, use em todo lugar.

## A Ideia Central

Uma função de janela computa um valor para cada linha com base em uma *janela* de linhas relacionadas — sem colapsar essas linhas como o `GROUP BY` faz. A linha permanece no conjunto de resultados; ela apenas recebe uma nova coluna computada ao lado.

```sql
SELECT
    order_id,
    customer_id,
    amount,
    SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS running_total
FROM orders;
```

Isso dá a cada linha seu próprio total acumulado, particionado por cliente. Sem subquery. Sem join. Uma passagem.

## A Cláusula OVER()

`OVER()` é o que transforma uma função em função de janela. Um `OVER()` vazio significa "o conjunto inteiro de resultados é a janela":

```sql
SELECT
    product,
    revenue,
    revenue / SUM(revenue) OVER () AS pct_of_total
FROM sales;
```

Adicione `PARTITION BY` para dividir em janelas independentes:

```sql
-- Cada região tem sua própria janela independente
SELECT
    region,
    product,
    revenue,
    revenue / SUM(revenue) OVER (PARTITION BY region) AS pct_of_region
FROM sales;
```

Adicione `ORDER BY` dentro do `OVER()` para obter cálculos acumulados/progressivos:

```sql
SELECT
    order_date,
    amount,
    SUM(amount) OVER (ORDER BY order_date) AS cumulative_revenue
FROM orders;
```

## Funções de Ranking

```sql
SELECT
    employee_id,
    department,
    salary,

    -- Rank único por valor de salário (com lacunas em empates)
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank,

    -- Rank denso (sem lacunas)
    DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dense_rank,

    -- Número de linha sequencial (sem empates)
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC, employee_id) AS row_num,

    -- Bucket percentil (1–4 para quartis)
    NTILE(4) OVER (PARTITION BY department ORDER BY salary DESC) AS salary_quartile
FROM employees;
```

`ROW_NUMBER()` é o que uso com mais frequência — é a forma mais limpa de deduplicar ou obter "último registro por grupo":

```sql
-- Pega o pedido mais recente por cliente
WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) AS rn
    FROM orders
)
SELECT * FROM ranked WHERE rn = 1;
```

## Funções de Valor: LAG e LEAD

Compare uma linha com uma anterior ou futura sem self-join:

```sql
SELECT
    order_date,
    revenue,
    LAG(revenue, 1) OVER (ORDER BY order_date)  AS prev_day_revenue,
    LEAD(revenue, 1) OVER (ORDER BY order_date) AS next_day_revenue,

    revenue - LAG(revenue, 1) OVER (ORDER BY order_date) AS day_over_day_delta,

    (revenue - LAG(revenue, 1) OVER (ORDER BY order_date))
        / NULLIF(LAG(revenue, 1) OVER (ORDER BY order_date), 0) AS pct_change
FROM daily_revenue
ORDER BY order_date;
```

`LAG(col, n, default)` — offset `n` linhas atrás, retorna `default` se o limite da janela for cruzado (evita NULL na primeira linha).

## FIRST_VALUE, LAST_VALUE, NTH_VALUE

```sql
SELECT
    sale_date,
    amount,
    FIRST_VALUE(amount) OVER (
        PARTITION BY customer_id
        ORDER BY sale_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS first_ever_purchase,
    LAST_VALUE(amount) OVER (
        PARTITION BY customer_id
        ORDER BY sale_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS most_recent_purchase
FROM sales;
```

Note a cláusula de frame (`ROWS BETWEEN ... AND UNBOUNDED FOLLOWING`) — `LAST_VALUE` só está correto quando o frame se estende até o fim da partição.

## Cláusulas de Frame

O frame define quais linhas dentro da partição estão "em escopo" para a função de janela:

```sql
-- Padrão (quando ORDER BY está presente): RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
-- Média móvel de 7 dias:
AVG(amount) OVER (
    ORDER BY sale_date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
)

-- Soma acumulada de 30 dias:
SUM(amount) OVER (
    ORDER BY sale_date
    ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
)
```

`ROWS` conta linhas literais; `RANGE` usa intervalo lógico (linhas pares com o mesmo valor de ORDER BY). `ROWS` é quase sempre o que você quer.

## Dica Prática: Janelas Nomeadas

Se você reutiliza a mesma definição de janela várias vezes, nomeie-a:

```sql
SELECT
    product,
    revenue,
    SUM(revenue) OVER w  AS total,
    AVG(revenue) OVER w  AS average,
    RANK()       OVER w  AS rank
FROM sales
WINDOW w AS (PARTITION BY category ORDER BY revenue DESC);
```

Mais limpo e evita o erro de copiar-e-colar onde as janelas ficam fora de sincronia.

---

Funções de janela são uma daquelas ferramentas em que, uma vez internalizadas, você começa a ver os problemas que elas resolvem em todo lugar. Totais acumulados, análise de coorte, deduplicação, comparações de período, bucketing percentil — tudo mais limpo com janelas do que sem.
