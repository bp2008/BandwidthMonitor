using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Security;
using System.Text;
using System.Threading.Tasks;
using BandwidthMonitor.Monitoring;
using BPUtil;
using BPUtil.SimpleHttp;
using Newtonsoft.Json;

namespace BandwidthMonitor
{
	public class WebServer : HttpServer
	{
		public static string SettingsPath = Globals.ApplicationDirectoryBase + "Settings.cfg";
		public static Settings settings = new Settings();
		private long rnd = StaticRandom.Next(int.MinValue, int.MaxValue);
		private RouterReader routerReader;
		static WebServer()
		{
			settings.Load(SettingsPath);
			settings.SaveIfNoExist(SettingsPath);

			// Outgoing "secure" connections accept all certificates, because most routers don't have a trusted certificate for https.
			ServicePointManager.ServerCertificateValidationCallback = new RemoteCertificateValidationCallback(delegate { return true; });
		}
		public WebServer() : base(settings.webPort)
		{
			routerReader = RouterReader.Create(settings.routerType, settings.routerAddress, settings.routerUser, settings.routerPass);
			routerReader.Start();
		}
		public override void handleGETRequest(HttpProcessor p)
		{
			string pageLower = p.requestedPage.ToLower();
			if (pageLower.StartsWith("api/"))
			{
				p.writeFailure("405 Method Not Allowed");
			}
			else if (p.requestedPage == "")
			{
				p.writeRedirect("default.html");
			}
			else
			{
				string wwwPath = Globals.ApplicationDirectoryBase + "www/";
#if DEBUG
				if (System.Diagnostics.Debugger.IsAttached)
					wwwPath = Globals.ApplicationDirectoryBase + "../../www/";
#endif
				DirectoryInfo WWWDirectory = new DirectoryInfo(wwwPath);
				string wwwDirectoryBase = WWWDirectory.FullName.Replace('\\', '/').TrimEnd('/') + '/';
				FileInfo fi = new FileInfo(wwwDirectoryBase + p.requestedPage);
				string targetFilePath = fi.FullName.Replace('\\', '/');
				if (!targetFilePath.StartsWith(wwwDirectoryBase) || targetFilePath.Contains("../"))
				{
					p.writeFailure("400 Bad Request");
					return;
				}
				if (!fi.Exists)
					return;
				if ((fi.Extension == ".html" || fi.Extension == ".htm") && fi.Length < 256000)
				{
					string html = File.ReadAllText(fi.FullName);
					html = html.Replace("%%VERSION%%", System.Reflection.Assembly.GetExecutingAssembly().GetName().Version.ToString());
					html = html.Replace("%%RND%%", rnd.ToString());

					byte[] data = Encoding.UTF8.GetBytes(html);
					p.writeSuccess(Mime.GetMimeType(fi.Extension), data.Length);
					p.outputStream.Flush();
					p.rawOutputStream.Write(data, 0, data.Length);
					p.rawOutputStream.Flush();
				}
				else
				{
					string mime = Mime.GetMimeType(fi.Extension);
					if (pageLower.StartsWith(".well-known/acme-challenge/"))
						mime = "text/plain";
					if (fi.LastWriteTimeUtc.ToString("R") == p.GetHeaderValue("if-modified-since"))
					{
						p.writeSuccess(mime, -1, "304 Not Modified");
						return;
					}
					p.writeSuccess(mime, fi.Length, additionalHeaders: GetCacheLastModifiedHeaders(TimeSpan.FromHours(1), fi.LastWriteTimeUtc));
					p.outputStream.Flush();
					using (FileStream fs = fi.OpenRead())
					{
						fs.CopyTo(p.rawOutputStream);
					}
					p.rawOutputStream.Flush();
				}
			}
		}
		private List<KeyValuePair<string, string>> GetCacheLastModifiedHeaders(TimeSpan maxAge, DateTime lastModifiedUTC)
		{
			List<KeyValuePair<string, string>> additionalHeaders = new List<KeyValuePair<string, string>>();
			additionalHeaders.Add(new KeyValuePair<string, string>("Cache-Control", "max-age=" + (long)maxAge.TotalSeconds + ", public"));
			additionalHeaders.Add(new KeyValuePair<string, string>("Last-Modified", lastModifiedUTC.ToString("R")));
			return additionalHeaders;
		}

		public override void handlePOSTRequest(HttpProcessor p, StreamReader inputData)
		{
			string pageLower = p.requestedPage.ToLower();
			if (pageLower.StartsWith("api/"))
			{
				string cmd = p.requestedPage.Substring("api/".Length);
				switch (cmd)
				{
					case "getBandwidthRecords":
						{
							JSAPI.APIResponse response;
							long lastTime = p.GetLongParam("time");
							if (lastTime == 0)
								response = new JSAPI.BandwidthRecordsResponse(routerReader.GetAllRecordsFromAllDevices());
							else
								response = new JSAPI.BandwidthRecordsResponse(routerReader.GetNewRecordsFromAllDevices(lastTime));
							p.CompressResponseIfCompatible();
							p.writeSuccess("application/json");
							p.outputStream.Write(JsonConvert.SerializeObject(response));
						}
						break;
				}
			}
		}

		protected override void stopServer()
		{
			routerReader?.Stop();
		}
	}
}
