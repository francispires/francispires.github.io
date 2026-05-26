---
title: "SQL Window Functions: The Feature That Changed How I Write Queries"
description: "A practical guide to OVER(), PARTITION BY, and the aggregate/ranking/value function families — with real use cases for data analysis."
pubDate: 2024-01-15
lang: en
translationKey: sql-window-functions
category: sql
tags: ["sql", "analytics", "data-engineering", "postgresql"]
draft: false
---

If you're still reaching for subqueries or self-joins to compute running totals, rankings, or period-over-period comparisons — window functions will change your life.

They're available in PostgreSQL, DuckDB, BigQuery, Snowflake, SQLite (3.25+), SQL Server, and MySQL 8+. Learn them once, use them everywhere.

## The Core Idea

A window function computes a value for each row based on a *window* of related rows — without collapsing those rows like `GROUP BY` does. The row stays in the result set; it just gets a new computed column alongside it.

```sql
SELECT
    order_id,
    customer_id,
    amount,
    SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS running_total
FROM orders;
```

This gives every row its own running total, partitioned per customer. No subquery. No join. One pass.

## The OVER() Clause

`OVER()` is what makes a function a window function. An empty `OVER()` means "the entire result set is the window":

```sql
SELECT
    product,
    revenue,
    revenue / SUM(revenue) OVER () AS pct_of_total
FROM sales;
```

Add `PARTITION BY` to split into independent windows:

```sql
-- Each region gets its own independent window
SELECT
    region,
    product,
    revenue,
    revenue / SUM(revenue) OVER (PARTITION BY region) AS pct_of_region
FROM sales;
```

Add `ORDER BY` inside `OVER()` to get running/cumulative calculations:

```sql
SELECT
    order_date,
    amount,
    SUM(amount) OVER (ORDER BY order_date) AS cumulative_revenue
FROM orders;
```

## Ranking Functions

```sql
SELECT
    employee_id,
    department,
    salary,

    -- Unique rank per salary value (gaps on ties)
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank,

    -- Dense rank (no gaps)
    DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dense_rank,

    -- Sequential row number (no ties)
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC, employee_id) AS row_num,

    -- Percentile bucket (1–4 for quartiles)
    NTILE(4) OVER (PARTITION BY department ORDER BY salary DESC) AS salary_quartile
FROM employees;
```

`ROW_NUMBER()` is the one I reach for most — it's the cleanest way to deduplicate or get "latest record per group":

```sql
-- Get the most recent order per customer
WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) AS rn
    FROM orders
)
SELECT * FROM ranked WHERE rn = 1;
```

## Value Functions: LAG and LEAD

Compare a row to a previous or future row without a self-join:

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

`LAG(col, n, default)` — offset `n` rows back, return `default` if the window boundary is crossed (avoids NULL in the first row).

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

Note the frame clause (`ROWS BETWEEN ... AND UNBOUNDED FOLLOWING`) — `LAST_VALUE` is only correct when the frame extends to the end of the partition.

## Frame Clauses

The frame defines which rows within the partition are "in scope" for the window function:

```sql
-- Default (when ORDER BY is present): RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
-- 7-day rolling average:
AVG(amount) OVER (
    ORDER BY sale_date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
)

-- 30-day rolling sum:
SUM(amount) OVER (
    ORDER BY sale_date
    ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
)
```

`ROWS` counts literal rows; `RANGE` uses logical range (peer rows with the same ORDER BY value). `ROWS` is almost always what you want.

## Practical Tip: Named Windows

If you reuse the same window definition multiple times, name it:

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

Cleaner and avoids the copy-paste error where windows drift out of sync.

---

Window functions are one of those tools where, once you internalize them, you start seeing problems they solve everywhere. Running totals, cohort analysis, deduplication, period comparisons, percentile bucketing — all cleaner with windows than without.
