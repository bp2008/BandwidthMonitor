using BPUtil;

namespace BandwidthMonitor
{
	public class Settings : SerializableObjectBase
	{
		public ushort webPort = 10008;
		public string routerAddress = "http://192.168.0.1:80/";
		public string routerUser = "admin";
		public string routerPass = "admin";
		public RouterType routerType = RouterType.Tomato;
	}

	public enum RouterType
	{
		Tomato
	}
}