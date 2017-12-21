using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.ServiceProcess;
using System.Text;
using System.Threading.Tasks;
using BPUtil;

namespace BandwidthMonitor
{
	partial class MainSvc : ServiceBase
	{
		WebServer server;
		public MainSvc()
		{
			InitializeComponent();
		}
		public void DoStart()
		{
			OnStart(null);
		}
		public void DoStop()
		{
			OnStop();
		}
		protected override void OnStart(string[] args)
		{
			server = new WebServer();
			server.Start();
		}

		protected override void OnStop()
		{
			server?.Stop();
		}
	}
}
