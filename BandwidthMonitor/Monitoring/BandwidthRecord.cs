using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BandwidthMonitor.Monitoring
{
	public class BandwidthRecord
	{
		public long Time;
		public long Download;
		public long Upload;
		public BandwidthRecord()
		{
		}
		public BandwidthRecord(long time, long down, long up) : this()
		{
			Time = time;
			Download = down;
			Upload = up;
		}
	}
}
