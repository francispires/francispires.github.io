---
title: ".NET for Data Engineers: Using C# for ETL Pipelines and Data Processing"
description: "Learn how to leverage C# and .NET for building robust ETL pipelines and data processing workflows, with practical code examples for data engineers transitioning from Python."
pubDate: 2026-05-26
lang: en
translationKey: net-for-data-engineers-using-c-for-etl-pipelines-and-data-processing
category: csharp
tags: ["dotnet", "csharp", "data-engineering", "etl"]
draft: false
heroImage: "/img/posts/net-for-data-engineers-using-c-for-etl-pipelines-and-data-processing.jpg"
---
## Why Consider .NET for Data Engineering?

Python dominates the data engineering landscape, but C# and .NET offer compelling advantages that many overlook: strong typing catches errors at compile time, excellent performance for CPU-bound operations, and first-class tooling in Visual Studio. If your organization already uses .NET or you need to integrate with existing C# systems, building ETL pipelines in .NET makes practical sense.

## Setting Up Your Data Engineering Project

Start with a console application and add the essential NuGet packages:

```bash
dotnet new console -n DataPipeline
cd DataPipeline
dotnet add package CsvHelper
dotnet add package Dapper
dotnet add package Microsoft.Data.SqlClient
dotnet add package Parquet.Net
```

These packages cover most ETL scenarios: CSV parsing, database operations, and columnar file formats.

## Reading and Transforming CSV Files

CsvHelper is the go-to library for CSV operations. Here's a complete example that reads, transforms, and validates data:

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
            if (record.Amount <= 0) continue; // Skip invalid records
            
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

The `yield return` pattern enables streaming processing—you handle millions of rows without loading everything into memory.

## Database Operations with Dapper

Dapper provides a lightweight ORM that feels natural for data engineers used to writing SQL. Here's how to load transformed data into SQL Server:

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
            // Batch inserts for better performance
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

## Parallel Processing for Large Datasets

.NET excels at parallel processing. Use `Parallel.ForEachAsync` for I/O-bound operations or PLINQ for CPU-bound transformations:

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

## Working with Parquet Files

Parquet is essential for modern data pipelines. Parquet.Net handles this efficiently:

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

## Building a Complete Pipeline

Tie everything together with a pipeline orchestrator:

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

            // Archive processed file
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

## When to Choose .NET Over Python

.NET shines in specific scenarios:

- **Integration with existing .NET systems**: No need for polyglot complexity
- **Performance-critical pipelines**: C# can be 5-10x faster for CPU-bound transformations
- **Type safety requirements**: Catch schema mismatches at compile time
- **Enterprise environments**: Better fit for teams already using Azure and Microsoft stack

Python remains better for quick prototyping, when using specialized ML libraries, or when your team's expertise is primarily Python.

## Conclusion

.NET provides a solid foundation for data engineering work. The combination of strong typing, excellent performance, and mature libraries like Dapper and CsvHelper makes C# a legitimate choice for ETL pipelines. Start small—perhaps a single file processing job—and expand from there as you become comfortable with the patterns.
