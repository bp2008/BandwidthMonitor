using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using BandwidthMonitor.Monitoring;
using BPUtil;

namespace BandwidthMonitor.Routers
{
	public class TomatoRouter : RouterReader
	{
		public Thread getVendors;
		public TimeSpan timeBetweenBandwidthUpdates = TimeSpan.FromSeconds(2);
		public TimeSpan timeBetweenDevListUpdates = TimeSpan.FromMinutes(1);

		private ConcurrentQueue<string> macVendorRequestQueue = new ConcurrentQueue<string>();
		private ConcurrentDictionary<string, string> macToVendorMap = new ConcurrentDictionary<string, string>();
		private ConcurrentDictionary<string, string> addressToMacMap = new ConcurrentDictionary<string, string>();
		private ConcurrentDictionary<string, string> addressToNameMap = new ConcurrentDictionary<string, string>();

		private Regex rxGetIpData = new Regex("'([^']+)':{rx:([^,]+),tx:([^}]+)}", RegexOptions.Compiled);

		public TomatoRouter() : base()
		{
			getVendors = new Thread(vendorThreadLoop);
			getVendors.IsBackground = true;
			getVendors.Name = "TomatoRouter Vendor Getter";
			getVendors.Start();
		}

		protected override void threadLoop()
		{
			try
			{
				while (true)
				{
					try
					{
						WebRequestUtility wru = new WebRequestUtility("BandwidthMonitor");
						wru.BasicAuthCredentials = new NetworkCredential(User, Pass);
						// Learn the http_id, used in later requests
						BpWebResponse response = wru.GET(Address + "ipt-realtime.asp");
						string ipt_realtime_page = response.str;
						Match m_http_id = Regex.Match(ipt_realtime_page, "'http_id' ?: ?'([^']+)',");
						string http_id = null;
						if (m_http_id.Success)
							http_id = m_http_id.Groups[1].Value;
						else
						{
							Logger.Debug("Could not find http_id in response from ipt-realtime.asp");
							Thread.Sleep(30000);
							continue;
						}

						// Begin retrieving bandwidth usage data.
						Stopwatch sw = new Stopwatch();
						// Tomato's bandwidth reporting uses cumulative totals, so we need to keep track of the previous records to know how much has changed.
						Dictionary<string, BandwidthRecord> previousRecords = new Dictionary<string, BandwidthRecord>();
						Stopwatch swDevList = new Stopwatch();
						response = wru.POST(Address + "update.cgi", new string[] { "exec", "devlist", "_http_id", http_id });
						if (string.IsNullOrWhiteSpace(response.str))
						{
							Logger.Info("Received null or whitespace response instead of expected devlist");
							Thread.Sleep(30000);
							continue;
						}
						HandleDevListResponse(response.str);
						swDevList.Start();
						while (true)
						{
							sw.Restart();
							long time = TimeUtil.GetTimeInMsSinceEpoch();
							response = wru.POST(Address + "update.cgi", new string[] { "exec", "iptmon", "_http_id", http_id });
							foreach (Match m in rxGetIpData.GetMatches(response.str))
							{
								string ip = m.Groups[1].Value;
								long downloadRaw = Hex.PrefixedHexToLong(m.Groups[2].Value);
								long uploadRaw = Hex.PrefixedHexToLong(m.Groups[3].Value);

								DeviceInfo device;
								BandwidthRecord prev;

								if (!devices.TryGetValue(ip, out device))
									devices[ip] = device = new DeviceInfo(ip);

								if (!previousRecords.TryGetValue(ip, out prev))
									previousRecords[ip] = prev = new BandwidthRecord(time, downloadRaw, uploadRaw);

								device.Name = GetName(device.Address);
								device.MAC = GetMac(device.Address);
								device.Vendor = GetMacVendor(device.MAC);

								long downloadBytes;
								long uploadBytes;
								if (downloadRaw < prev.Download)
									downloadBytes = downloadRaw + (0xFFFFFFFF - prev.Download);
								else
									downloadBytes = downloadRaw - prev.Download;
								if (uploadRaw < prev.Upload)
									uploadBytes = uploadRaw + (0xFFFFFFFF - prev.Upload);
								else
									uploadBytes = uploadRaw - prev.Upload;

								device.AddNewBandwidthRecord(new BandwidthRecord(time, downloadBytes / 2, uploadBytes / 2));

								previousRecords[ip] = new BandwidthRecord(time, downloadRaw, uploadRaw);
							}
							if (swDevList.Elapsed > timeBetweenDevListUpdates)
							{
								swDevList.Restart();
								response = wru.POST(Address + "update.cgi", new string[] { "exec", "devlist", "_http_id", http_id });
								HandleDevListResponse(response.str);
							}
							sw.Stop();
							TimeSpan timeToWait = timeBetweenBandwidthUpdates - sw.Elapsed;
							if (timeToWait > TimeSpan.Zero)
								Thread.Sleep(timeToWait);
						}
					}
					catch (ThreadAbortException) { throw; }
					catch (Exception ex)
					{
						Logger.Debug(ex);
						Thread.Sleep(5000);
					}
				}
			}
			catch (ThreadAbortException) { throw; }
			catch (Exception ex)
			{
				Logger.Debug(ex);
			}
		}
		// IP, MAC
		private Regex rxReadArpList = new Regex("\\['([^']+)','(..:..:..:..:..:..)',", RegexOptions.Compiled);
		// MAC, IP, Name
		private Regex rxReadDhcpStatic = new Regex("(..:..:..:..:..:..)<([^<]+)<([^<]*)<", RegexOptions.Compiled);
		// Name, IP, MAC
		private Regex rxReadDhcpLeases = new Regex("\\['([^']*)','([^']+)','(..:..:..:..:..:..)'", RegexOptions.Compiled);
		private void HandleDevListResponse(string str)
		{
			// addressToMacMap addressToNameMap
			string arplist = GetStringBetween(str, "arplist = [", "wlnoise = [");
			foreach (Match m in rxReadArpList.Matches(arplist))
				addressToMacMap[m.Groups[1].Value] = m.Groups[2].Value;

			string dhcpd_static = GetStringBetween(str, "dhcpd_static = '", "wldev = [");
			foreach (Match m in rxReadDhcpStatic.Matches(dhcpd_static))
			{
				string mac = m.Groups[1].Value;
				string ip = m.Groups[2].Value;
				string name = m.Groups[3].Value;
				addressToMacMap[ip] = mac;
				if (!string.IsNullOrEmpty(name))
					addressToNameMap[ip] = name;
			}

			string dhcpd_lease = GetStringBetween(str, "dhcpd_lease = [", null);
			foreach (Match m in rxReadDhcpLeases.Matches(dhcpd_lease))
			{
				string name = m.Groups[1].Value;
				string ip = m.Groups[2].Value;
				string mac = m.Groups[3].Value;
				addressToMacMap[ip] = mac;
				if (!string.IsNullOrEmpty(name))
					addressToNameMap[ip] = name;
			}
		}
		private string GetMac(string address)
		{
			if (addressToMacMap.TryGetValue(address, out string MAC))
				return MAC;
			return "";
		}
		private string GetName(string address)
		{
			if (addressToNameMap.TryGetValue(address, out string Name))
				return Name;
			return "";
		}
		private string GetMacVendor(string MAC)
		{
			if (string.IsNullOrEmpty(MAC))
				return "";
			if (macToVendorMap.TryGetValue(MAC, out string Vendor))
				return Vendor;
			else if (macVendorRequestQueue.Count < 500)
				macVendorRequestQueue.Enqueue(MAC);
			return "";
		}
		private void vendorThreadLoop()
		{
			try
			{
				using (WebClient wc = new WebClient())
				{
					string MAC = "";
					while (true)
					{
						try
						{
							while (macVendorRequestQueue.TryDequeue(out MAC))
							{
								if (macToVendorMap.ContainsKey(MAC))
									continue;
								string cleanMAC = GetCleanMAC(MAC);
								string Vendor = wc.DownloadString("https://api.macvendors.com/" + cleanMAC);
								macToVendorMap[MAC] = Vendor;
							}
							Thread.Sleep(2000);
						}
						catch (ThreadAbortException) { throw; }
						catch (WebException ex)
						{
							if (ex.Response != null && ex.Response is HttpWebResponse && ((HttpWebResponse)ex.Response).StatusCode == HttpStatusCode.NotFound)
								macToVendorMap[MAC] = "Vendor not found";
							else
							{
								Logger.Debug(ex, MAC);
								Thread.Sleep(5000);
							}
						}
						catch (Exception ex)
						{
							Logger.Debug(ex, MAC);
							Thread.Sleep(5000);
						}
					}
				}
			}
			catch (ThreadAbortException) { throw; }
			catch (Exception ex)
			{
				Logger.Debug(ex);
			}
		}

		private string GetCleanMAC(string MAC)
		{
			Try.Catch_RethrowThreadAbort(() => MAC = MAC.Replace(":", "").Replace("-", "").Substring(0, 6));
			return MAC;
		}
		private string GetStringBetween(string input, string begin, string end)
		{
			int iBegin = input.IndexOf(begin);
			if (iBegin == -1)
				return "";
			iBegin += begin.Length;
			if (end == null)
				return input.Substring(iBegin);
			int iEnd = input.IndexOf(end, iBegin);
			if (iEnd == -1)
				return input.Substring(iBegin);
			return input.Substring(iBegin, iEnd - iBegin);
		}
	}
}
