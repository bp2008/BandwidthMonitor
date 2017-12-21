using System.Collections;
using System.Collections.Generic;

namespace BandwidthMonitor.JSAPI
{
	public class BandwidthRecordsResponse : APIResponse
	{
		public IEnumerable<Monitoring.DeviceInfo> devices;

		public BandwidthRecordsResponse(IEnumerable<Monitoring.DeviceInfo> devices) : base()
		{
			this.devices = devices;
		}
	}
}