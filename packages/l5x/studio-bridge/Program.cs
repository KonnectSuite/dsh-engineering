using RockwellAutomation.LogixDesigner;
using RockwellAutomation.LogixDesigner.Logging;

// Deliberately narrow: no online edits, tag setters, forces, bit toggles, or data writes.
// The plugin obtains human approval before invoking upload, mode change, or download.
if (args.Length < 3 || args.Length > 9
    || !new[] { "edit-routine", "verify", "export-l5x", "read-mode", "read-dint", "read-tag", "sample-tags", "get-comm-path", "upload-new", "go-online", "change-mode", "download" }.Contains(args[0]))
{
    Console.Error.WriteLine("Unsupported Studio bridge command or argument count.");
    return 2;
}

// Offline-only component import. Never reuse a diagnostic/online project handle.
if (args[0] == "edit-routine")
{
    if (args.Length != 9 || !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)
        || !Path.GetExtension(args[2]).Equals(".l5x", StringComparison.OrdinalIgnoreCase)
        || !Path.GetExtension(args[3]).Equals(".acd", StringComparison.OrdinalIgnoreCase)
        || !Path.GetExtension(args[6]).Equals(".l5x", StringComparison.OrdinalIgnoreCase)
        || new[] { args[4], args[5] }.Any(name => !System.Text.RegularExpressions.Regex.IsMatch(name, "^[A-Za-z_][A-Za-z0-9_]*$"))) return 2;
    string working = Path.GetFullPath(args[3]);
    string componentFile = working + ".routine.l5x";
    if (File.Exists(working) || File.Exists(args[6]) || File.Exists(componentFile)) return 2;
    try
    {
        string Hash(string file) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(file)));
        if (!Hash(args[1]).Equals(args[7], StringComparison.OrdinalIgnoreCase)
            || !Hash(args[2]).Equals(args[8], StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Source changed before offline edit");
        File.Copy(args[1], working, false);
        if (!Hash(working).Equals(args[7], StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Copied ACD hash mismatch");
        using LogixProject edit = await LogixProject.OpenLogixProjectAsync(working, new StdOutEventLogger());
        await edit.GoOfflineAsync();
        string xpath = $"Controller/Programs/Program[@Name='{args[4]}']/Routines/Routine[@Name='{args[5]}']";
        await edit.PartialExportToXmlFileAsync(xpath, componentFile);
        var options = new System.Xml.XmlReaderSettings { DtdProcessing = System.Xml.DtdProcessing.Prohibit, XmlResolver = null };
        using var draftReader = System.Xml.XmlReader.Create(args[2], options);
        var draft = System.Xml.Linq.XDocument.Load(draftReader, System.Xml.Linq.LoadOptions.PreserveWhitespace);
        using var componentReader = System.Xml.XmlReader.Create(componentFile, options);
        var component = System.Xml.Linq.XDocument.Load(componentReader, System.Xml.Linq.LoadOptions.PreserveWhitespace);
        componentReader.Close();
        draftReader.Close();
        System.Xml.Linq.XElement FindRoutine(System.Xml.Linq.XDocument doc) => doc.Root!.Element("Controller")!.Element("Programs")!
            .Elements("Program").Single(p => (string?)p.Attribute("Name") == args[4]).Element("Routines")!
            .Elements("Routine").Single(r => (string?)r.Attribute("Name") == args[5]);
        var target = FindRoutine(component);
        var replacement = new System.Xml.Linq.XElement(FindRoutine(draft));
        replacement.SetAttributeValue("Use", (string?)target.Attribute("Use") ?? "Target");
        target.ReplaceWith(replacement);
        component.Save(componentFile);
        Console.WriteLine("OFFLINE_COMPONENT_IMPORT_STARTED");
        await edit.PartialImportFromXmlFileAsync(xpath, componentFile, LogixProject.ImportCollisionOptions.OverwriteOnColl, false);
        await edit.BuildAsync(LogixProject.RequestedBuildTarget.DefaultTarget);
        await edit.SaveAsync();
        await edit.SaveAsAsync(Path.GetFullPath(args[6]), true, true);
        if (!Hash(args[1]).Equals(args[7], StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Original ACD changed during edit");
        Console.WriteLine("OFFLINE_ACD_EDIT_SUCCEEDED");
        return 0;
    }
    catch (Exception error)
    {
        Console.Error.WriteLine($"OFFLINE_ACD_EDIT_FAILED: {error.GetType().Name}: {error.Message}");
        return 1;
    }
}

if (args[0] == "upload-new")
{
    if (args.Length != 3 || !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)
        || File.Exists(args[1]) || string.IsNullOrWhiteSpace(args[2])) return 2;
    try
    {
        using LogixProject _ = await LogixProject.UploadToNewProjectAsync(Path.GetFullPath(args[1]), args[2], new StdOutEventLogger());
        Console.WriteLine("UPLOAD_TO_NEW_ACD_SUCCEEDED");
        return 0;
    }
    catch (Exception error)
    {
        Console.Error.WriteLine($"UPLOAD_TO_NEW_ACD_FAILED: {error.GetType().Name}: {error.Message}");
        return 1;
    }
}

if (args[0] is "go-online" or "change-mode" or "download")
{
    if ((args[0] == "change-mode" ? args.Length != 6 : args.Length != 4)
        || !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)
        || string.IsNullOrWhiteSpace(args[2])
        || !System.Text.RegularExpressions.Regex.IsMatch(args[3], "^[a-fA-F0-9]{64}$")) return 2;
    string actionFile = Path.GetFullPath(args[1]);
    if (!File.Exists(actionFile)) return 2;
    try
    {
        string actualHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(await File.ReadAllBytesAsync(actionFile)));
        if (!actualHash.Equals(args[3], StringComparison.OrdinalIgnoreCase))
        {
            Console.Error.WriteLine("ACD hash changed after approval.");
            return 2;
        }
        using LogixProject action = await LogixProject.OpenLogixProjectAsync(actionFile, new StdOutEventLogger());
        await action.SetCommunicationsPathAsync(args[2]);
        if (args[0] == "go-online")
        {
            await action.GoOnlineAsync();
            Console.WriteLine("GO_ONLINE_SUCCEEDED");
            return 0;
        }
        if (args[0] == "change-mode")
        {
            var observed = await action.ReadControllerModeAsync();
            if (!Enum.TryParse<LogixProject.ControllerMode>(args[5], false, out var expected)
                || observed != expected)
            {
                Console.Error.WriteLine($"Controller mode changed since approval; expected {args[5]}, observed {observed}");
                return 2;
            }
            LogixProject.RequestedControllerMode target = args[4] switch
            {
                "Program" => LogixProject.RequestedControllerMode.Program,
                "Run" => LogixProject.RequestedControllerMode.Run,
                "Test" => LogixProject.RequestedControllerMode.Test,
                _ => throw new ArgumentException("Unsupported controller mode")
            };
            await action.ChangeControllerModeAsync(target);
            Console.WriteLine($"CONTROLLER_MODE_AFTER={await action.ReadControllerModeAsync()}");
            return 0;
        }
        var before = await action.ReadControllerModeAsync();
        if (before != LogixProject.ControllerMode.Program)
        {
            Console.Error.WriteLine($"Download requires Program mode; current mode: {before}");
            return 2;
        }
        Console.WriteLine($"CONTROLLER_MODE_BEFORE={before}");
        await action.DownloadAsync();
        Console.WriteLine("DOWNLOAD_SUCCEEDED");
        return 0;
    }
    catch (Exception error)
    {
        Console.Error.WriteLine($"CONTROLLER_ACTION_FAILED: {error.GetType().Name}: {error.Message}");
        return 1;
    }
}

if (args[0] == "verify" && !Path.GetExtension(args[1]).Equals(".l5x", StringComparison.OrdinalIgnoreCase)) return 2;
if (args[0] == "export-l5x" && (!Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)
    || !Path.GetExtension(args[2]).Equals(".l5x", StringComparison.OrdinalIgnoreCase))) return 2;
if (args[0] == "read-dint" && !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)) return 2;
if (args[0] == "read-tag" && !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)) return 2;
if (args[0] == "sample-tags" && !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)) return 2;
if (args[0] == "read-mode" && !Path.GetExtension(args[1]).Equals(".l5x", StringComparison.OrdinalIgnoreCase)
    && !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)) return 2;
if (args[0] == "get-comm-path" && !Path.GetExtension(args[1]).Equals(".l5x", StringComparison.OrdinalIgnoreCase)
    && !Path.GetExtension(args[1]).Equals(".acd", StringComparison.OrdinalIgnoreCase)) return 2;
string source = Path.GetFullPath(args[1]);
if (!File.Exists(source))
{
    Console.Error.WriteLine("Input L5X must exist.");
    return 2;
}

try
{
    if (args[0] == "sample-tags")
    {
        if (args.Length != 6 || string.IsNullOrWhiteSpace(args[2])
            || !int.TryParse(args[4], out int count) || count is < 1 or > 20
            || !int.TryParse(args[5], out int intervalMs) || intervalMs is < 250 or > 5000
            || (long)count * intervalMs > 30000) return 2;
        var tags = System.Text.Json.JsonSerializer.Deserialize<List<WatchTag>>(args[3]);
        if (tags is null || tags.Count is < 1 or > 16 || tags.Any(tag => tag.Name is null || tag.DataType is null
            || !System.Text.RegularExpressions.Regex.IsMatch(tag.Name, "^[A-Za-z_][A-Za-z0-9_]*$")
            || !new[] { "BOOL", "INT", "DINT", "REAL" }.Contains(tag.DataType))) return 2;
        using LogixProject monitor = await LogixProject.OpenLogixProjectAsync(source, new StdOutEventLogger());
        await monitor.SetCommunicationsPathAsync(args[2]);
        await monitor.GoOnlineAsync();
        var clock = System.Diagnostics.Stopwatch.StartNew();
        for (int sample = 0; sample < count; sample++)
        {
            var started = clock.ElapsedMilliseconds;
            var values = new List<object>();
            int successfulReads = 0;
            foreach (var tag in tags)
            {
                string path = $"Controller/Tags/Tag[@Name='{tag.Name}']";
                var readAt = DateTimeOffset.UtcNow;
                try
                {
                    object value = tag.DataType switch
                    {
                        "BOOL" => await monitor.GetTagValueBOOLAsync(path, LogixProject.OperationMode.Online),
                        "INT" => await monitor.GetTagValueINTAsync(path, LogixProject.OperationMode.Online),
                        "DINT" => await monitor.GetTagValueDINTAsync(path, LogixProject.OperationMode.Online),
                        "REAL" => await monitor.GetTagValueREALAsync(path, LogixProject.OperationMode.Online),
                        _ => throw new ArgumentException("Unsupported tag type")
                    };
                    values.Add(new { tag = tag.Name, data_type = tag.DataType, value, observed_at = readAt, quality = "good" });
                    successfulReads++;
                }
                catch (Exception error)
                {
                    values.Add(new { tag = tag.Name, data_type = tag.DataType, value = (object?)null, observed_at = readAt,
                        quality = "error", error = $"{error.GetType().Name}: {error.Message}" });
                    if (error.Message.Contains("RxE_COMM_", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.Error.WriteLine($"SAMPLING_FAILED: FactoryTalk Linx communication failed while reading {tag.Name}: {error.Message}");
                        return 1;
                    }
                }
            }
            Console.WriteLine("SAMPLE_JSON=" + System.Text.Json.JsonSerializer.Serialize(new
            {
                sample, elapsed_ms = clock.ElapsedMilliseconds, sweep_ms = clock.ElapsedMilliseconds - started, values
            }));
            if (successfulReads == 0)
            {
                Console.Error.WriteLine("SAMPLING_FAILED: Every tag read failed; stopping instead of repeating the same communication error.");
                return 1;
            }
            if (clock.ElapsedMilliseconds >= 30000 && sample + 1 < count)
            {
                Console.Error.WriteLine("SAMPLING_FAILED: Reads exceeded the 30 second monitoring window; reduce tags or requested rate.");
                return 1;
            }
            if (sample + 1 < count)
            {
                long wait = (sample + 1L) * intervalMs - clock.ElapsedMilliseconds;
                if (wait > 0) await Task.Delay((int)wait);
            }
        }
        Console.WriteLine("SAMPLING_SUCCEEDED");
        return 0;
    }
    if (args[0] == "export-l5x")
    {
        if (args.Length != 3 || File.Exists(args[2])) return 2;
        using LogixProject project = await LogixProject.OpenLogixProjectAsync(source, new StdOutEventLogger());
        await project.SaveAsAsync(Path.GetFullPath(args[2]), true, true);
        if (new FileInfo(args[2]).Length == 0) return 1;
        Console.WriteLine("EXPORTED_L5X_SUCCEEDED");
        return 0;
    }
    if (args[0] == "get-comm-path")
    {
        if (args.Length != 3 || args[2] != "--read-only") return 2;
        using LogixProject project = await LogixProject.OpenLogixProjectAsync(source, new StdOutEventLogger());
        Console.WriteLine($"PROJECT_COMM_PATH={await project.GetCommunicationsPathAsync()}");
        return 0;
    }
    if (args[0] == "read-mode")
    {
        if (args.Length != 3) return 2;
        if (string.IsNullOrWhiteSpace(args[2])) return 2;
        using LogixProject monitor = await LogixProject.OpenLogixProjectAsync(source, new StdOutEventLogger());
        await monitor.SetCommunicationsPathAsync(args[2]);
        var mode = await monitor.ReadControllerModeAsync();
        Console.WriteLine($"READ_CONTROLLER_MODE={mode}");
        return 0;
    }

    if (args[0] is "read-dint" or "read-tag")
    {
        if (args.Length != (args[0] == "read-tag" ? 5 : 4)
            || !System.Text.RegularExpressions.Regex.IsMatch(args[3], "^[A-Za-z_][A-Za-z0-9_]*$")) return 2;
        string dataType = args[0] == "read-dint" ? "DINT" : args[4];
        if (!new[] { "BOOL", "INT", "DINT", "REAL" }.Contains(dataType)) return 2;
        using LogixProject monitor = await LogixProject.OpenLogixProjectAsync(source, new StdOutEventLogger());
        await monitor.SetCommunicationsPathAsync(args[2]);
        string tagPath = $"Controller/Tags/Tag[@Name='{args[3]}']";
        string value = dataType switch
        {
            "BOOL" => (await monitor.GetTagValueBOOLAsync(tagPath, LogixProject.OperationMode.Online)).ToString().ToLowerInvariant(),
            "INT" => (await monitor.GetTagValueINTAsync(tagPath, LogixProject.OperationMode.Online)).ToString(System.Globalization.CultureInfo.InvariantCulture),
            "DINT" => (await monitor.GetTagValueDINTAsync(tagPath, LogixProject.OperationMode.Online)).ToString(System.Globalization.CultureInfo.InvariantCulture),
            "REAL" => (await monitor.GetTagValueREALAsync(tagPath, LogixProject.OperationMode.Online)).ToString("R", System.Globalization.CultureInfo.InvariantCulture),
            _ => throw new ArgumentException("Unsupported tag type")
        };
        Console.WriteLine(args[0] == "read-dint" ? $"READ_DINT={value}" : $"READ_TAG={value}");
        return 0;
    }

    if (args.Length != 3) return 2;
    if (!Path.GetExtension(args[2]).Equals(".acd", StringComparison.OrdinalIgnoreCase)) return 2;
    string output = Path.GetFullPath(args[2]);
    if (File.Exists(output) || source.Equals(output, StringComparison.OrdinalIgnoreCase))
    {
        Console.Error.WriteLine("Output must be a new, distinct ACD file.");
        return 2;
    }
    // The L5X-derived project keeps the controller name, so release it before opening the ACD
    // that carries the same name; otherwise the second open aborts without changes.
    using (LogixProject imported = await LogixProject.OpenLogixProjectAsync(source, new StdOutEventLogger()))
    {
        await imported.SaveAsAsync(output, false, false);
    }
    using LogixProject offline = await LogixProject.OpenLogixProjectAsync(output, new StdOutEventLogger());
    await offline.BuildAsync(LogixProject.RequestedBuildTarget.DefaultTarget);
    await offline.SaveAsync();
    Console.WriteLine("OFFLINE_BUILD_SUCCEEDED");
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine($"SDK_OPERATION_FAILED: {error.GetType().Name}: {error.Message}");
    return 1;
}

internal sealed record WatchTag(string Name, string DataType);
