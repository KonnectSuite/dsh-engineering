using System;
using FTOptix.Core;
using FTOptix.HMIProject;
using FTOptix.NetLogic;
using FTOptix.UI;
using UAManagedCore;

// The "PLC" behind the FLEXO-1 bottling line demo.
//
// A session NetLogic inside the window: the model tag table lives at Model/Line, the
// display is the session UI under Owner. It simulates four stations, a recipe-dependent
// cycle, four latched alarms and the operator counters, and pushes everything the
// operator reads into the named labels, lamps and bars.
public class LineLogic : BaseNetLogic
{
	private PeriodicTask task;
	private readonly Random random = new Random(20261115);
	private IUANode line;

	// command tags (written by the operator buttons through UICommands)
	private IUAVariable cmdStart;
	private IUAVariable cmdStop;
	private IUAVariable cmdReset;
	private IUAVariable cmdAck;
	private IUAVariable simJam;

	// machine state tags
	private IUAVariable stateTag;
	private IUAVariable recipeTag;
	private IUAVariable filledTag;
	private IUAVariable rejectedTag;
	private IUAVariable activeAlarmsTag;
	private IUAVariable lineRunningTag;
	private IUAVariable faultedTag;
	private IUAVariable convRunningTag;
	private IUAVariable fillerRunningTag;
	private IUAVariable capperRunningTag;
	private IUAVariable alarm1Tag;
	private IUAVariable alarm2Tag;
	private IUAVariable alarm3Tag;
	private IUAVariable alarm4Tag;
	private IUAVariable speedSetpointTag;
	private IUAVariable speedActualTag;
	private IUAVariable fillLevelTag;
	private IUAVariable torqueTag;
	private IUAVariable oeeTag;
	private IUAVariable cycleTimeTag;
	private IUAVariable uptimeTag;

	// simulation
	private const int StateIdle = 0;
	private const int StateRunning = 1;
	private const int StateStopping = 2;
	private const int StateFault = 3;
	private int state = StateIdle;
	private double stopTimer;
	private double cycleTimer;
	private double uptime;
	private int filled;
	private int rejected;
	private double fillLevel;
	private double torque;
	private double oee = 0.0;
	private readonly double[] history = new double[5];
	private int historyIndex;

	private sealed class Alarm
	{
		public string Title;
		public string Detail;
		public bool Active;
		public bool Acked;
		public DateTime Since;
	}

	private readonly Alarm[] alarms = new Alarm[]
	{
		new Alarm { Title = "Guard interlock open", Detail = "Safety circuit · reset required" },
		new Alarm { Title = "High capping torque", Detail = "Torque above 2.4 Nm" },
		new Alarm { Title = "Low fill volume", Detail = "Fill below the recipe tolerance" },
		new Alarm { Title = "Conveyor jam", Detail = "Infeed photo-eye blocked" }
	};

	private static readonly string[] RecipeNames = { "250 ml", "500 ml", "1 L" };
	private static readonly double[] RecipeFill = { 3.0, 4.5, 6.0 };
	private static readonly double[] RecipeTorque = { 1.2, 1.8, 2.4 };
	private static readonly double[] RecipeSpeed = { 60.0, 48.0, 36.0 };
	private const int ShiftTarget = 240;

	private static readonly uint Ink = 0xFF1F2933;
	private static readonly uint Muted = 0xFF5B6B7A;
	private static readonly uint Green = 0xFF30A46C;
	private static readonly uint Red = 0xFFE5484D;
	private static readonly uint Amber = 0xFFF5A524;
	private static readonly uint Grey = 0xFF9AA7B4;
	private static readonly uint Accent = 0xFF0FAFFF;

	public override void Start()
	{
		line = Project.Current.Get("Model/Line");
		if (line == null)
		{
			Log.Error("LineLogic", "Model/Line is missing: the tag table must exist before the logic starts.");
			return;
		}
		cmdStart = Var("CmdStart");
		cmdStop = Var("CmdStop");
		cmdReset = Var("CmdReset");
		cmdAck = Var("CmdAck");
		simJam = Var("SimJam");
		stateTag = Var("State");
		recipeTag = Var("Recipe");
		filledTag = Var("BottlesFilled");
		rejectedTag = Var("BottlesRejected");
		activeAlarmsTag = Var("ActiveAlarms");
		lineRunningTag = Var("LineRunning");
		faultedTag = Var("Faulted");
		convRunningTag = Var("ConvRunning");
		fillerRunningTag = Var("FillerRunning");
		capperRunningTag = Var("CapperRunning");
		alarm1Tag = Var("Alarm1Active");
		alarm2Tag = Var("Alarm2Active");
		alarm3Tag = Var("Alarm3Active");
		alarm4Tag = Var("Alarm4Active");
		speedSetpointTag = Var("SpeedSetpoint");
		speedActualTag = Var("SpeedActual");
		fillLevelTag = Var("FillLevel");
		torqueTag = Var("Torque");
		oeeTag = Var("OEE");
		cycleTimeTag = Var("CycleTime");
		uptimeTag = Var("Uptime");
		task = new PeriodicTask(Tick, 200, LogicObject);
		task.Start();
		Log.Info("LineLogic", "FLEXO-1 simulation started; operator commands arrive through Model/Line.");
	}

	public override void Stop()
	{
		if (task != null)
		{
			task.Dispose();
			task = null;
		}
	}

	[ExportMethod]
	public void OnConfirmReset()
	{
		filled = 0;
		rejected = 0;
		uptime = 0.0;
		historyIndex = 0;
		for (int index = 0; index < history.Length; index += 1) history[index] = 0.0;
		WriteAll();
		CloseDialog("ConfirmReset");
		Log.Info("LineLogic", "Shift counters reset from the confirmation dialog.");
	}

	[ExportMethod]
	public void OnConfirmRecipe()
	{
		if (recipeTag != null) recipeTag.Value = 2;
		Touch("ConfirmRecipe");
		WriteAll();
		Log.Info("LineLogic", "Recipe 1 L applied from the confirmation dialog.");
	}

	// Operator commands as exported methods. A button handler that calls a
	// method on this session NetLogic writes the command tag through the
	// runtime itself, which is the path Rockwell's own templates use for
	// login and navigation. The tag command objects stay in the model for
	// anything else that wants to write them.
	[ExportMethod]
	public void CmdStartLine()
	{
		if (cmdStart != null) cmdStart.Value = true;
	}

	[ExportMethod]
	public void CmdStopLine()
	{
		if (cmdStop != null) cmdStop.Value = true;
	}

	[ExportMethod]
	public void CmdAckAlarms()
	{
		if (cmdAck != null) cmdAck.Value = true;
	}

	[ExportMethod]
	public void CmdSimulateJam()
	{
		if (simJam != null) simJam.Value = !Bit(simJam);
	}

	[ExportMethod]
	public void CmdRecipe1() { if (recipeTag != null) recipeTag.Value = 0; }

	[ExportMethod]
	public void CmdRecipe2() { if (recipeTag != null) recipeTag.Value = 1; }

	[ExportMethod]
	public void CmdRecipe3() { if (recipeTag != null) recipeTag.Value = 2; }

	private IUAVariable Var(string name)
	{
		var variable = line.GetVariable(name);
		if (variable == null) Log.Error("LineLogic", "Model/Line/" + name + " is missing.");
		return variable;
	}

	private static int Int(IUAVariable variable, int fallback = 0)
	{
		if (variable == null) return fallback;
		try { return Convert.ToInt32(variable.Value.ToString()); } catch { return fallback; }
	}

	private static double Dbl(IUAVariable variable, double fallback = 0.0)
	{
		if (variable == null) return fallback;
		try { return Convert.ToDouble(variable.Value.ToString()); } catch { return fallback; }
	}

	private static bool Bit(IUAVariable variable)
	{
		if (variable == null) return false;
		try { return string.Equals(variable.Value.ToString(), "True", StringComparison.OrdinalIgnoreCase); } catch { return false; }
	}

	private static void Set(IUAVariable variable, int value)
	{
		if (variable != null) variable.Value = (UAValue)value;
	}

	private static void Set(IUAVariable variable, double value)
	{
		if (variable != null) variable.Value = value;
	}

	private static void Set(IUAVariable variable, bool value)
	{
		if (variable != null) variable.Value = value;
	}

	private void Tick()
	{
		const double seconds = 0.2;
		PickCommands();
		Simulate(seconds);
		Publish(seconds);
		Render();
	}

	private void PickCommands()
	{
		if (Bit(cmdStart))
		{
			Set(cmdStart, false);
			if (state == StateIdle || state == StateFault)
			{
				state = StateRunning;
				cycleTimer = 0.0;
			}
		}
		if (Bit(cmdStop))
		{
			Set(cmdStop, false);
			if (state == StateRunning) { state = StateStopping; stopTimer = 2.0; }
		}
		if (Bit(cmdReset))
		{
			Set(cmdReset, false);
			ResetConditions();
		}
		if (Bit(cmdAck))
		{
			Set(cmdAck, false);
			foreach (var alarm in alarms) if (alarm.Active) alarm.Acked = true;
		}
	}

	private void ResetConditions()
	{
		state = StateIdle;
		foreach (var alarm in alarms) { alarm.Active = false; alarm.Acked = false; }
		alarm1Tag.Value = false;
		setTimeoutNone();
	}

	private void setTimeoutNone()
	{
		stopTimer = 0.0;
		cycleTimer = 0.0;
	}

	private void Simulate(double seconds)
	{
		torque = Math.Max(0.0, torque + (random.NextDouble() - 0.5) * 0.12);
		fillLevel = Math.Min(100.0, Math.Max(0.0, fillLevel + (random.NextDouble() - 0.5) * 0.8));

		// Guard interlock: a rare event while running.
		if (state == StateRunning && random.NextDouble() < 0.0015) Raise(0, "Safety circuit opened while feeding.");
		if (state == StateRunning && torque > 2.35) Raise(1, "Torque " + torque.ToString("0.00") + " Nm above the 2.4 Nm limit.");
		if (state == StateRunning && fillLevel < 96.0) Raise(2, "Fill " + fillLevel.ToString("0.0") + " % below tolerance.");
		if (Bit(simJam)) Raise(3, "Infeed photo-eye blocked: clear the conveyor.");

		if (alarms[0].Active || alarms[3].Active) state = StateFault;

		if (state == StateStopping)
		{
			stopTimer -= seconds;
			if (stopTimer <= 0.0) { state = StateIdle; setTimeoutNone(); }
		}

		if (state == StateRunning && !alarms[0].Active)
		{
			uptime += seconds;
			double fillSeconds = RecipeFill[Int(recipeTag)];
			cycleTimer += seconds;
			if (cycleTimer >= fillSeconds)
			{
				cycleTimer = 0.0;
				filled += 1;
				fillLevel = 92.0 + random.NextDouble() * 7.0;
				torque = RecipeTorque[Int(recipeTag)] + (random.NextDouble() - 0.5) * 0.5;
				if (random.NextDouble() < 0.03) rejected += 1;
			}
			history[historyIndex] = 60.0 / Math.Max(1.0, fillSeconds);
		}

		// Conditions clear on their own for the analog-looking alarms.
		if (alarms[1].Active && torque < 2.1) Clear(1);
		if (alarms[2].Active && fillLevel > 97.5) Clear(2);
		if (alarms[3].Active && !Bit(simJam)) Clear(3);

		double performance = state == StateRunning ? 1.0 : 0.0;
		double quality = filled + rejected == 0 ? 1.0 : (double)filled / (filled + rejected);
		oee = 100.0 * 0.95 * performance * quality;
	}

	private void Raise(int index, string detail)
	{
		var alarm = alarms[index];
		if (alarm.Active) return;
		alarm.Active = true;
		alarm.Acked = false;
		alarm.Since = DateTime.Now;
		alarm.Detail = detail;
	}

	private void Clear(int index)
	{
		var alarm = alarms[index];
		alarm.Active = false;
		alarm.Acked = false;
	}

	private void Publish(double seconds)
	{
		Set(stateTag, state);
		Set(filledTag, filled);
		Set(rejectedTag, rejected);
		Set(activeAlarmsTag, CountActive());
		Set(lineRunningTag, state == StateRunning);
		Set(faultedTag, state == StateFault);
		Set(convRunningTag, state == StateRunning);
		Set(fillerRunningTag, state == StateRunning);
		Set(capperRunningTag, state == StateRunning);
		Set(alarm1Tag, alarms[0].Active);
		Set(alarm2Tag, alarms[1].Active);
		Set(alarm3Tag, alarms[2].Active);
		Set(alarm4Tag, alarms[3].Active);
		Set(speedSetpointTag, RecipeSpeed[Int(recipeTag)]);
		Set(speedActualTag, state == StateRunning ? RecipeSpeed[Int(recipeTag)] : 0.0);
		Set(fillLevelTag, fillLevel);
		Set(torqueTag, torque);
		Set(oeeTag, oee);
		Set(cycleTimeTag, RecipeFill[Int(recipeTag)]);
		Set(uptimeTag, uptime);
	}

	private int CountActive()
	{
		int count = 0;
		foreach (var alarm in alarms) if (alarm.Active) count += 1;
		return count;
	}

	private void Render()
	{
		string stateText = state == StateRunning ? "RUNNING" : state == StateFault ? "FAULT" : state == StateStopping ? "STOPPING" : "IDLE";
		SetText("StateValue", stateText);
		SetFill("StateLamp", state == StateRunning ? Green : state == StateFault ? Red : state == StateStopping ? Amber : Grey);

		SetText("Kpi1Value", filled.ToString());
		SetText("Kpi2Value", oee.ToString("0.0"));
		SetText("Kpi3Value", rejected.ToString());
		SetText("Kpi4Value", RecipeFill[Int(recipeTag)].ToString("0.0"));
		SetText("Stat1Value", (state == StateRunning ? RecipeSpeed[Int(recipeTag)] : 0.0).ToString("0.0") + " bpm");
		SetText("Stat2Value", fillLevel.ToString("0.0") + " %");
		SetText("Stat3Value", torque.ToString("0.00") + " Nm");
		SetText("BarLabel", filled + " / " + ShiftTarget + " bottles this shift");
		SetText("UptimeLabel", "Uptime " + TimeSpan.FromSeconds(uptime).ToString(@"hh\:mm\:ss"));
		SetWidth("BarFill", Math.Max(0.0, Math.Min(1.0, (double)filled / ShiftTarget)) * 460.0);

		SetText("ShellHeaderChip", stateText);
		SetText("ShellFooterStatus", "Comm. Driver - simulator connected · " + RecipeNames[Int(recipeTag)] + " recipe");

		// Overview alarm rows mirror the first four alarms.
		for (int index = 0; index < alarms.Length; index += 1)
		{
			var alarm = alarms[index];
			string row = (index + 1).ToString();
			string prefix = "AlarmRow" + row;
			SetText(prefix + "/Name", alarm.Title);
			SetText(prefix + "/When", alarm.Active ? (alarm.Acked ? "ACKED " : "ACTIVE ") + alarm.Since.ToString("HH:mm:ss") : "—");
			SetFill(prefix + "/Lamp", alarm.Active ? (alarm.Acked ? Amber : Red) : Grey);
		}

		// Line station lamps.
		string[] stations = { "Station1", "Station2", "Station3", "Station4" };
		bool[] running = { state == StateRunning, state == StateRunning, state == StateRunning, state == StateRunning };
		for (int index = 0; index < stations.Length; index += 1)
		{
			SetFill(stations[index] + "Lamp", running[index] ? Green : state == StateFault ? Red : Grey);
			SetText(stations[index] + "State", running[index] ? "RUNNING" : state == StateFault ? "FAULT" : "STOPPED");
		}
		SetText("Current", "Active recipe: " + RecipeNames[Int(recipeTag)]);

		// Alarms screen rows: four named alarms plus a clear row.
		for (int index = 0; index < alarms.Length; index += 1)
		{
			var alarm = alarms[index];
			string row = (index + 1).ToString();
			SetText("Row" + row + "/Name", alarm.Active || alarm.Acked ? alarm.Title : "—");
			SetText("Row" + row + "/Detail", alarm.Active || alarm.Acked ? alarm.Detail : "No active alarm");
			SetText("Row" + row + "/State", alarm.Active ? (alarm.Acked ? "ACKED" : "ACTIVE") : "CLEARED");
			SetText("Row" + row + "/When", alarm.Since == default ? "—" : alarm.Since.ToString("HH:mm:ss"));
			SetFill("Row" + row + "/Lamp", alarm.Active ? (alarm.Acked ? Amber : Red) : Grey);
		}
		SetText("ActiveCount", CountActive() + " ACTIVE");

		// Chart history bars, oldest first.
		for (int index = 0; index < history.Length; index += 1)
		{
			double value = history[(historyIndex + index) % history.Length];
			double height = Math.Max(6.0, Math.Min(1.0, value / 60.0) * 96.0);
			string bar = "Bar" + (index + 1).ToString();
			SetHeight(bar, height);
			SetTop(bar, 150.0 - height);
			SetText("BarValue" + (index + 1).ToString(), value.ToString("0"));
		}
		historyIndex = (historyIndex + 1) % history.Length;

		// Recipes screen active card.
		string recipe = RecipeNames[Int(recipeTag)];
		SetText("CurrentValue", recipe);
		SetText("CurrentDetail", "Fill " + RecipeFill[Int(recipeTag)].ToString("0.0") + " s · target torque " + RecipeTorque[Int(recipeTag)].ToString("0.0") + " Nm · " + RecipeSpeed[Int(recipeTag)].ToString("0") + " bpm");
	}

	// UI nodes are session instances: find the first segment recursively from the window,
	// then walk the rest of the path relative to it.
	private IUANode Find(string path)
	{
		try
		{
			string[] segments = path.Split('/');
			IUANode node = Owner.Find(segments[0]);
			for (int index = 1; index < segments.Length && node != null; index += 1) node = node.Get(segments[index]);
			return node;
		}
		catch { return null; }
	}

	private void SetText(string name, string text)
	{
		var node = Find(name);
		var label = node as Label;
		if (label == null) return;
		label.Text = text;
	}

	private void SetFill(string name, uint colour)
	{
		var node = Find(name);
		if (node is Rectangle rectangle) { rectangle.FillColor = new Color(colour); return; }
		if (node is Ellipse ellipse) ellipse.FillColor = new Color(colour);
	}

	private void SetWidth(string name, double width)
	{
		if (Find(name) is Rectangle rectangle) rectangle.Width = (float)width;
	}

	private void SetHeight(string name, double height)
	{
		if (Find(name) is Rectangle rectangle) rectangle.Height = (float)height;
	}

	private void SetTop(string name, double top)
	{
		if (Find(name) is Rectangle rectangle) rectangle.TopMargin = (float)top;
	}

	private void Touch(string dialogName)
	{
		var node = Find(dialogName);
		if (node != null) Log.Info("LineLogic", "dialog " + dialogName + " handled");
	}

	private void CloseDialog(string dialogName)
	{
		var node = Find(dialogName);
		if (node == null) return;
		try
		{
			var close = node.GetType().GetMethod("Close");
			if (close != null) close.Invoke(node, null);
		}
		catch (Exception error)
		{
			Log.Error("LineLogic", "Could not close " + dialogName + ": " + error.Message);
		}
	}

	private void WriteAll()
	{
		Set(filledTag, filled);
		Set(rejectedTag, rejected);
		Set(uptimeTag, uptime);
	}
}
