using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using BandwidthMonitor.Routers;
using BPUtil;

namespace BandwidthMonitor.Monitoring
{
	public abstract class RouterReader
	{
		public string Address;
		public string User;
		public string Pass;

		protected ConcurrentDictionary<string, DeviceInfo> devices = new ConcurrentDictionary<string, DeviceInfo>();
		protected Thread backgroundWorker;

		public IEnumerable<DeviceInfo> GetAllRecordsFromAllDevices()
		{
			return devices.Values;
		}

		public IEnumerable<DeviceInfo> GetNewRecordsFromAllDevices(long lastTime)
		{
			return devices.Values.Select(device => device.GetCopyWithRecordsSinceTime(lastTime));
		}

		/// <summary>
		/// Subclasses are responsible for implementing this method.  The method is called in its own dedicated thread and should be designed to run continuously and robustly.
		/// The implementation must rethrow any caught ThreadAbortException, as this signal indicates the service is shutting down and the thread must be stopped.
		/// </summary>
		protected abstract void threadLoop();

		public RouterReader()
		{
		}

		public void Start()
		{
			backgroundWorker = new Thread(outer_threadLoop);
			backgroundWorker.Name = this.GetType().Name + " Worker";
			backgroundWorker.Start();
		}
		public void Stop()
		{
			backgroundWorker?.Abort();
		}
		protected void outer_threadLoop()
		{
			try
			{
				while (true)
				{
					try
					{
						threadLoop();
					}
					catch (ThreadAbortException) { throw; }
					catch (Exception ex)
					{
						Logger.Debug(ex);
						Thread.Sleep(1000);
					}
				}
			}
			catch (ThreadAbortException)
			{
			}
			catch (Exception ex)
			{
				Logger.Debug(ex);
			}
		}

		public static RouterReader Create(RouterType routerType, string address, string user, string pass)
		{
			RouterReader router = null;
			switch (routerType)
			{
				case RouterType.Tomato:
					router = new TomatoRouter();
					break;
			}
			if (router != null)
			{
				router.Address = address;
				router.User = user;
				router.Pass = pass;
			}
			return router;
		}
	}
}