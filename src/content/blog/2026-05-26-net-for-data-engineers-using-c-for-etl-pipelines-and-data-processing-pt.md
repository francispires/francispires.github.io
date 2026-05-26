---
title: ".NET para Engenheiros de Dados: Usando C# em Pipelines ETL e Processamento de Dados"
description: "Aprenda a usar C# e .NET para construir pipelines ETL robustos e fluxos de processamento de dados, com exemplos práticos de código para engenheiros de dados que vêm do Python."
pubDate: 2026-05-26
lang: pt-BR
translationKey: net-for-data-engineers-using-c-for-etl-pipelines-and-data-processing
category: csharp
tags: ["dotnet", "csharp", "engenharia-de-dados", "etl"]
draft: false
heroImage: "/img/posts/net-for-data-engineers-using-c-for-etl-pipelines-and-data-processing.jpg"
---
## Por Que Considerar .NET para Engenharia de Dados?

Python domina o cenário de engenharia de dados, mas C# e .NET oferecem vantagens que muitos ignoram: tipagem forte que pega erros em tempo de compilação, excelente performance para operações CPU-bound, e ferramentas de primeira linha no Visual Studio. Se sua empresa já usa .NET ou você precisa integrar com sistemas C# existentes, construir pipelines ETL em .NET faz todo sentido.

## Configurando Seu Projeto de Engenharia de Dados

Comece com uma aplicação console e adicione os pacotes NuGet essenciais:

```bash
dotnet new console -n DataPipeline
cd DataPipeline
dotnet add package CsvHelper
dotnet add package Dapper
dotnet add package Microsoft.Data.SqlClient
dotnet add package Parquet.Net
```

Esses pacotes cobrem a maioria dos cenários ETL: parsing de CSV, operações de banco de dados e formatos de arquivo colunares.

## Lendo e Transformando Arquivos CSV

CsvHelper é a biblioteca padrão para operações com CSV. Aqui está um exemplo completo que lê, transforma e valida dados:

```csharp
using CsvHelper;
using CsvHelper.Configuration;
using System.Globalization;

public record SalesRecord(
    int OrderId,
    DateTime OrderDate,
    string Product,
    decimal Amount,
    string Region
);

public record TransformedSale(
    int OrderId,
    int Year,
    int Quarter,
    string Product,
    decimal AmountUsd,
    string RegionCode
);

public class SalesEtl
{
    private static readonly Dictionary<string, string> RegionMapping = new()
    {
        ["North America"] = "NA",
        ["Europe"] = "EU",
        ["Asia Pacific"] = "APAC",
        ["Latin America"] = "LATAM"
    };

    public IEnumerable<TransformedSale> Extract(string filePath)
    {
        using var reader = new StreamReader(filePath);
        using var csv = new CsvReader(reader, CultureInfo.InvariantCulture);
        
        foreach (var record in csv.GetRecords<SalesRecord>())
        {
            if (record.Amount <= 0) continue; // Ignora registros inválidos
            
            yield return new TransformedSale(
                record.OrderId,
                record.OrderDate.Year,
                (record.OrderDate.Month - 1) / 3 + 1,
                record.Product.Trim().ToUpperInvariant(),
                record.Amount,
                RegionMapping.GetValueOrDefault(record.Region, "OTHER")
            );
        }
    }
}
```

O padrão `yield return` permite processamento em streaming—você processa milhões de linhas sem carregar tudo na memória.

## Operações de Banco de Dados com Dapper

Dapper é um ORM leve que funciona de forma natural para engenheiros de dados acostumados a escrever SQL. Veja como carregar dados transformados no SQL Server:

```csharp
using Dapper;
using Microsoft.Data.SqlClient;

public class SalesRepository
{
    private readonly string _connectionString;

    public SalesRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task BulkInsertAsync(IEnumerable<TransformedSale> sales)
    {
        const string sql = @"
            INSERT INTO SalesFact (OrderId, Year, Quarter, Product, AmountUsd, RegionCode)
            VALUES (@OrderId, @Year, @Quarter, @Product, @AmountUsd, @RegionCode)";

        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        
        using var transaction = connection.BeginTransaction();
        try
        {
            // Inserts em lote para melhor performance
            foreach (var batch in sales.Chunk(1000))
            {
                await connection.ExecuteAsync(sql, batch, transaction);
            }
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<IEnumerable<dynamic>> QuerySalesByRegionAsync(int year)
    {
        const string sql = @"
            SELECT RegionCode, Quarter, SUM(AmountUsd) as TotalSales
            FROM SalesFact
            WHERE Year = @Year
            GROUP BY RegionCode, Quarter
            ORDER BY RegionCode, Quarter";

        using var connection = new SqlConnection(_connectionString);
        return await connection.QueryAsync(sql, new { Year = year });
    }
}
```

## Processamento Paralelo para Grandes Volumes de Dados

.NET se destaca em processamento paralelo. Use `Parallel.ForEachAsync` para operações I/O-bound ou PLINQ para transformações CPU-bound:

```csharp
public class ParallelProcessor
{
    public async Task ProcessMultipleFilesAsync(string[] filePaths)
    {
        var options = new ParallelOptions { MaxDegreeOfParallelism = 4 };
        
        await Parallel.ForEachAsync(filePaths, options, async (path, ct) =>
        {
            var etl = new SalesEtl();
            var records = etl.Extract(path);
            
            var repo = new SalesRepository(GetConnectionString());
            await repo.BulkInsertAsync(records);
            
            Console.WriteLine($"Processed: {path}");
        });
    }

    public List<TransformedSale> TransformWithPlinq(List<SalesRecord> records)
    {
        return records
            .AsParallel()
            .WithDegreeOfParallelism(Environment.ProcessorCount)
            .Where(r => r.Amount > 0)
            .Select(r => new TransformedSale(
                r.OrderId,
                r.OrderDate.Year,
                (r.OrderDate.Month - 1) / 3 + 1,
                r.Product.Trim().ToUpperInvariant(),
                r.Amount,
                "NA"
            ))
            .ToList();
    }
}
```

## Trabalhando com Arquivos Parquet

Parquet é essencial para pipelines de dados modernos. Parquet.Net lida com isso de forma eficiente:

```csharp
using Parquet;
using Parquet.Data;

public class ParquetHandler
{
    public async Task WriteParquetAsync(string path, List<TransformedSale> sales)
    {
        var orderIds = new DataColumn(
            new DataField<int>("order_id"),
            sales.Select(s => s.OrderId).ToArray());
            
        var years = new DataColumn(
            new DataField<int>("year"),
            sales.Select(s => s.Year).ToArray());
            
        var amounts = new DataColumn(
            new DataField<decimal>("amount_usd"),
            sales.Select(s => s.AmountUsd).ToArray());

        var schema = new Schema(orderIds.Field, years.Field, amounts.Field);
        
        using var stream = File.Create(path);
        using var writer = await ParquetWriter.CreateAsync(schema, stream);
        using var groupWriter = writer.CreateRowGroup();
        
        await groupWriter.WriteColumnAsync(orderIds);
        await groupWriter.WriteColumnAsync(years);
        await groupWriter.WriteColumnAsync(amounts);
    }
}
```

## Construindo um Pipeline Completo

Junte tudo com um orquestrador de pipeline:

```csharp
public class EtlPipeline
{
    private readonly SalesRepository _repository;
    private readonly ILogger<EtlPipeline> _logger;

    public EtlPipeline(SalesRepository repository, ILogger<EtlPipeline> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<PipelineResult> RunAsync(string sourcePath, string archivePath)
    {
        var stopwatch = Stopwatch.StartNew();
        var recordCount = 0;

        try
        {
            _logger.LogInformation("Starting ETL pipeline for {Path}", sourcePath);

            var etl = new SalesEtl();
            var records = etl.Extract(sourcePath).ToList();
            recordCount = records.Count;

            await _repository.BulkInsertAsync(records);

            // Arquiva o arquivo processado
            var archiveFile = Path.Combine(archivePath, 
                $"{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Path.GetFileName(sourcePath)}");
            File.Move(sourcePath, archiveFile);

            stopwatch.Stop();
            _logger.LogInformation(
                "Pipeline completed: {Records} records in {Elapsed}ms",
                recordCount, stopwatch.ElapsedMilliseconds);

            return new PipelineResult(true, recordCount, stopwatch.Elapsed);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Pipeline failed after {Records} records", recordCount);
            return new PipelineResult(false, recordCount, stopwatch.Elapsed, ex.Message);
        }
    }
}

public record PipelineResult(
    bool Success,
    int RecordsProcessed,
    TimeSpan Duration,
    string? ErrorMessage = null
);
```

## Quando Escolher .NET ao Invés de Python

.NET brilha em cenários específicos:

- **Integração com sistemas .NET existentes**: Sem precisar de complexidade poliglota
- **Pipelines críticos de performance**: C# pode ser 5-10x mais rápido para transformações CPU-bound
- **Requisitos de tipagem forte**: Pega incompatibilidades de schema em tempo de compilação
- **Ambientes corporativos**: Melhor fit para times que já usam Azure e stack Microsoft

Python continua melhor para prototipagem rápida, quando usando bibliotecas especializadas de ML, ou quando a expertise do seu time é principalmente Python.

## Conclusão

.NET oferece uma base sólida para trabalho de engenharia de dados. A combinação de tipagem forte, excelente performance e bibliotecas maduras como Dapper e CsvHelper faz do C# uma escolha legítima para pipelines ETL. Comece pequeno—talvez um job de processamento de arquivo único—e expanda conforme você se sentir confortável com os padrões.
