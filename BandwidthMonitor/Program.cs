using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.ServiceProcess;
using System.Text;
using System.Threading.Tasks;
using BPUtil;
using BPUtil.Forms;

namespace BandwidthMonitor
{
	class Program
	{
		private static MainSvc svcTestRun;

		static void Main(string[] args)
		{

			if (Environment.UserInteractive)
			{
				string Title = "Bandwidth Monitor " + System.Reflection.Assembly.GetExecutingAssembly().GetName().Version.ToString() + " Service Manager";
				string ServiceName = "BandwidthMonitor";
				ButtonDefinition btnTestRun = new ButtonDefinition("Test-Run Service", btnTestRun_Click);
				ButtonDefinition btnSettings = new ButtonDefinition("Edit Service Settings", btnSettings_Click);
				ButtonDefinition[] customButtons = new ButtonDefinition[] { btnTestRun, btnSettings };

				if (Debugger.IsAttached)
					btnTestRun_Click(null, null);

				System.Windows.Forms.Application.Run(new ServiceManager(Title, ServiceName, customButtons));

				svcTestRun?.DoStop();
			}
			else
			{
				ServiceBase[] ServicesToRun;
				ServicesToRun = new ServiceBase[]
				{
					new MainSvc()
				};
				ServiceBase.Run(ServicesToRun);
			}
		}
		private static void btnTestRun_Click(object sender, EventArgs e)
		{
			svcTestRun = new MainSvc();
			svcTestRun.DoStart();
		}

		private static void btnSettings_Click(object sender, EventArgs e)
		{
			Process.Start(WebServer.SettingsPath);
		}
	}
}
