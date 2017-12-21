using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BandwidthMonitor.Monitoring
{
	public class DeviceInfo
	{
		/// <summary>
		/// Maximum record age in milliseconds.
		/// </summary>
		public const long maxRecordAge = 600000; // 10 minutes in milliseconds

		public string Address;
		public string MAC;
		public string Vendor;
		public string Name;

		/// <summary>
		/// This is public so the JSON serializer will grab it.  Don't use this object yourself (treat it as if it were private).
		/// </summary>
		public ConcurrentQueue<BandwidthRecord> Bandwidth = new ConcurrentQueue<BandwidthRecord>();

		public DeviceInfo(string Address = "", string MAC = "", string Vendor = "", string Name = "", IEnumerable<BandwidthRecord> initialRecords = null)
		{
			this.Address = Address;
			this.MAC = MAC;
			this.Vendor = Vendor;
			this.Name = Name;
			if (initialRecords != null)
				foreach (BandwidthRecord record in initialRecords)
					Bandwidth.Enqueue(record);
		}
		public void AddNewBandwidthRecord(BandwidthRecord record)
		{
			long expireTime = record.Time - maxRecordAge;
			while (Bandwidth.TryPeek(out BandwidthRecord oldRecord) && oldRecord.Time < expireTime)
				Bandwidth.TryDequeue(out oldRecord);
			Bandwidth.Enqueue(record);
		}

		public DeviceInfo GetCopyWithRecordsSinceTime(long lastTime)
		{
			return new DeviceInfo(Address, MAC, Vendor, Name, GetBandwidthRecordsSinceTime(lastTime));
		}

		public IEnumerable<BandwidthRecord> GetAllBandwidthRecords()
		{
			return Bandwidth.AsEnumerable();
		}
		public IEnumerable<BandwidthRecord> GetBandwidthRecordsSinceTime(long time)
		{
			return Bandwidth.Where(r => time < r.Time);
		}
	}
}
