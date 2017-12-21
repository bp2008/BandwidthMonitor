var siteApi = (function ($)
{
	var modalOptions = { overlayOpacity: 0.3, closeOnOverlayClick: true };
	$.tablesorter.themes.bootstrap = {
		// these classes are added to the table. To see other table classes available,
		// look here: http://getbootstrap.com/css/#tables
		table: 'table table-bordered table-striped',
		caption: 'caption',
		// header class names
		header: 'bootstrap-header', // give the header a gradient background (theme.bootstrap_2.css)
		sortNone: '',
		sortAsc: '',
		sortDesc: '',
		active: '', // applied when column is sorted
		hover: '', // custom css required - a defined bootstrap style may not override other classes
		// icon class names
		icons: '', // add "bootstrap-icon-white" to make them white; this icon class is added to the <i> in the header
		iconSortNone: 'bootstrap-icon-unsorted', // class name added to icon when column is not sorted
		iconSortAsc: 'glyphicon glyphicon-chevron-up', // class name added to icon when column has ascending sort
		iconSortDesc: 'glyphicon glyphicon-chevron-down', // class name added to icon when column has descending sort
		filterRow: '', // filter row class; use widgetOptions.filter_cssFilter for the input/select element
		footerRow: '',
		footerCells: '',
		even: '', // even row zebra striping
		odd: ''  // odd row zebra striping
	};

	$.tablesorter.addParser(
		{
			// set a unique id 
			id: 'timeRough',
			is: function (s)
			{
				// return false so this parser is not auto detected 
				return false;
			},
			format: function (s)
			{
				if (s.indexOf(" d") > -1)
					return parseFloat(s) * 86400;
				else if (s.indexOf(" h") > -1)
					return parseFloat(s) * 3600;
				else if (s.indexOf(" m") > -1)
					return parseFloat(s) * 60;
				else
					return parseFloat(s)
			},
			// set type, either numeric or text 
			type: 'numeric'
		});
	$.tablesorter.addParser(
		{
			// set a unique id 
			id: 'firstIntegerParser',
			is: function (s)
			{
				// return false so this parser is not auto detected 
				return false;
			},
			format: function (s)
			{
				return parseInt(s);
			},
			// set type, either numeric or text 
			type: 'numeric'
		});

	var dataLoadStarted = false;
	var tableEditor = null;
	var tableDef = [
		{ name: "Name", field: "Name" },
		{ name: "Address", field: "Address" },
		{ name: "MAC", field: "MAC" },
		{ name: "Vendor", field: "Vendor" },
		{ name: "Download", field: "Download", type: "custom", customRender: RenderBandwidth, sorter: "firstIntegerParser" },
		{ name: "Upload", field: "Upload", type: "custom", customRender: RenderBandwidth, sorter: "firstIntegerParser" }
	];
	var tableOptions = {
		idColumn: "Address"
		, loadingImageUrl: "img/ajax-loader.gif"
		, theme: "bootstrap"
		, tableClass: "table"
		, customRowClick: rowClick
		, sortList: [[1, 0]]
	}

	$('.nav-pills').stickyTabs({ hashChangeCallback: hashChangeCallback });
	function hashChangeCallback(hash)
	{
		if (hash == "#usageByDevice")
		{
			LoadBandwidthData();
		}
	}
	$(function ()
	{
		LoadBandwidthData();
	});
	var bwDevices = {};
	var bwByTime = {};
	var lastTime = 0;
	function LoadBandwidthData()
	{
		if (dataLoadStarted)
			return;
		dataLoadStarted = true;
		tableEditor = $("#DataTableWrapper").TableEditor(tableDef, tableOptions);
		ExecAPI("getBandwidthRecords", function (response)
		{
			if (response.result == "success")
			{
				PreprocessData(response.devices);

				if (lastTableRenderTime == 0)
					RenderTableAtTime(0);

				InitializeGraphableData(response.devices);
				RenderChart();

				RefreshBwDataAfterTimeout();
			}
			else
				SimpleDialog.Text(response.error);
		}, function (jqXHR, textStatus, errorThrown)
			{
				tableEditor.LoadData(jqXHR.ErrorMessageHtml, true);
			});
	}
	function PreprocessData(devices)
	{
		for (var i = 0; i < devices.length; i++)
		{
			var device = devices[i];

			var bwDevice = bwDevices[device.Address];
			if (!bwDevice)
				bwDevice = bwDevices[device.Address] = {};
			bwDevice.Address = device.Address;
			bwDevice.MAC = device.MAC;
			bwDevice.Vendor = device.Vendor;
			bwDevice.Name = device.Name;

			for (var n = 0; n < device.Bandwidth.length; n++)
			{
				var record = device.Bandwidth[n];
				if (record.Time > lastTime)
					lastTime = record.Time;

				var bwTime = bwByTime[record.Time];
				if (!bwTime)
					bwTime = bwByTime[record.Time] = {};

				record.Address = device.Address;
				bwTime[device.Address] = record;
			}
		}

		// Trim old items
		var maxAge = 600000; // 10 minutes in milliseconds
		var ageLimit = lastTime - maxAge;
		var toRemove = new Array();
		for (timeKey in bwByTime)
		{
			var bwTime = bwByTime[timeKey];
			if (bwTime.Time < ageLimit)
				toRemove.push(bwTime.Time);
		}
		for (var i = 0; i < toRemove.length; i++)
			delete bwByTime[toRemove[i]];
	}
	function RefreshBwDataAfterTimeout()
	{
		setTimeout(RefreshBwData, 2000);
	}
	function RefreshBwData()
	{
		ExecAPI("getBandwidthRecords?time=" + lastTime, function (response)
		{
			if (response.result == "success")
			{
				PreprocessData(response.devices);

				if (lastTableRenderTime == 0)
					RenderTableAtTime(0);

				UpdateGraphableData(response.devices);
				UpdateChart();

				RefreshBwDataAfterTimeout();
			}
			else
				console.log(response.error);
		}, function (jqXHR, textStatus, errorThrown)
			{
				console.log(jqXHR.ErrorMessageHtml);
				RefreshBwDataAfterTimeout();
			});
	}
	function rowClick(e)
	{
		var $tr = $(this);
		var Address = $tr.attr("pk");
		console.log(Address);
	}
	var lastTableRenderTime = 0;
	function RenderTableAtTime(time)
	{
		lastTableRenderTime = time;
		if (time != 0)
		{
			$('#usageTblTime').text(GetTimeStr(new Date(time)) + " ");
			var $goLiveBtn = $('<input type="button" value="Return to Live" />');
			$goLiveBtn.on('click', function ()
			{
				RenderTableAtTime(0);
			});
			$('#usageTblTime').append($goLiveBtn);
		}
		else
		{
			time = lastTime;
			$('#usageTblTime').text("LIVE");
		}
		var devices = new Array();
		var bwTime = bwByTime[time];
		if (bwTime)
		{
			for (address in bwTime)
			{
				var record = bwTime[address];
				var device = bwDevices[address];
				devices.push({ Address: device.Address, MAC: device.MAC, Vendor: device.Vendor, Name: device.Name, Download: record.Download, Upload: record.Upload });
			}
			tableEditor.LoadData(devices);
		}
		else
		{
			$('#usageTblTime').append('<span> - Error</span>');
			console.log("Asked to render timestamp " + time + " to the table but could not find data for it.");
		}
	}
	///////////////////////////////////////////////////////////////
	// Chart //////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////
	var myChart;
	var graphableData;
	function InitializeGraphableData(devices)
	{
		for (var i = 0; i < devices.length; i++)
		{
			var device = devices[i];
			if (device.Address.endsWith(".0"))
			{
				graphableData = new Array();
				graphableData.push(GetSeries(device, true, "#0000FF"));
				graphableData.push(GetSeries(device, false, "#FF9000"));
				break;
			}
		}
		UpdateGraphableData(devices);
	}
	function GetSeries(device, download, color)
	{
		return {
			type: 'line',
			showSymbol: false,
			hoverAnimation: false,
			name: download ? "Download" : "Upload",
			areaStyle: {
				normal: {
					color: color,
					opacity: 0.25
				}
			},
			lineStyle: {
				normal: {
					width: 1,
					color: color,
					shadowColor: "#666666",
					shadowBlur: 0,
					shadowOffsetX: 0.5,
					shadowOffsetY: 0.5
				}
			},
			sampling: "average",
			data: new Array()
		}
	}
	function UpdateGraphableData(devices)
	{
		if (!graphableData || graphableData.length != 2)
			return;
		for (var i = 0; i < devices.length; i++)
		{
			var device = devices[i];
			if (device.Address.endsWith(".0"))
			{
				UpdateDataArray(device, true, graphableData[0].data);
				UpdateDataArray(device, false, graphableData[1].data);
				break;
			}
		}
	}
	var removeCount = 0;
	function UpdateDataArray(device, download, data)
	{
		var maxAge = 600000; // 10 minutes in milliseconds
		var newestAdded = 0;
		for (var i = 0; i < device.Bandwidth.length; i++)
		{
			var record = device.Bandwidth[i];
			var x = new Date(record.Time);
			var y = bytesToKilobits(download ? record.Download : record.Upload);
			data.push({ name: x.toString(), value: [x, y] });
			if (record.Time > newestAdded)
				newestAdded = record.Time;
		}
		if (newestAdded != 0)
		{
			var ageCutoff = newestAdded - maxAge;
			var removeCount = 0;
			for (var i = 0; i < data.length; i++)
			{
				if (data[i].value[0] < ageCutoff)
					removeCount++;
				else
					break;
			}
			if (removeCount > 0)
				data.splice(0, removeCount);
		}
	}
	function GetSeriesData(device, download)
	{
		var data = new Array();
		return data;
	}
	function UpdateChart()
	{
		myChart.setOption(
			{
				animation: true,
				series: graphableData
			});
	}
	var lastHoveredTime = 0;
	function RenderChart()
	{
		var $DataGraph = $('#DataGraph');
		myChart = echarts.init($DataGraph[0]);

		// specify chart configuration item and data
		var option = {
			title: {
				//text: 'Bandwidth Usage Chart'
			},
			tooltip: {
				trigger: 'axis',
				formatter: function (params)
				{
					//return GetTimeStr(params.value[0]) + " : " + params.value[1].toFixed(1) + " Kbps";
					var time = lastHoveredTime = params[0].value[0].getTime();
					var sb = new Array();
					var bwTime = bwByTime[time];
					var devices = new Array();
					if (bwTime)
					{
						for (address in bwTime)
							if (!address.endsWith(".0"))
								devices.push(bwTime[address]);
						devices.sort(function (a, b)
						{
							return (b.Download + b.Upload) - (a.Download + a.Upload);
						});
						for (var i = 0; i < devices.length && i < 10; i++)
						{
							var device = devices[i];
							//break;
							sb.push(device.Address.padRight(15, ' ') + ": " + formatBytes(device.Download) + " / " + formatBytes(device.Upload));
						}
					}
					var timeStr = GetTimeStr(params[0].value[0]);
					return '<div style="white-space: pre-wrap; font-family: Consolas, monospace;">' + timeStr + ': ' + params[0].value[1] + ' Kbps Download<br>'
						+ ''.padLeft(timeStr.length + 2, ' ') + params[1].value[1] + ' Kbps Upload'
						+ '<hr style="margin: 0px;">' + sb.join('<br>') + '</div>';
				},
				axisPointer: {
					animation: false
				}
			},
			grid: {
				left: 60
				, right: 60
			},
			xAxis: {
				type: 'time',
				splitLine: {
					show: true
				},
				splitNumber: 10
			},
			yAxis: {
				name: 'Download Kbps',
				type: 'value',
				//boundaryGap: [0, '100%'],
				splitLine: {
					show: true
				}
			},
			series: graphableData,
			animation: false
		};

		// use configuration item and data specified to show chart
		myChart.setOption(option);
		$(window).resize(function ()
		{
			myChart.resize();
		});
		$DataGraph.on('click', function ()
		{
			RenderTableAtTime(lastHoveredTime);
		});
	}
	this.GetBwByTime = function ()
	{
		return bwByTime;
	}
	//function GetAllStacked2()
	//{
	//	var series = new Array();
	//	for (var i = 1; i < dataResponse.devices.length; i++)
	//		series.push(GetSeries2(i));
	//	return series;
	//}
	//function GetSeries1(addr)
	//{
	//	return {
	//		type: 'line',
	//		showSymbol: false,
	//		hoverAnimation: false,
	//		data: GetData1(addr)
	//	}
	//}
	//function GetData1(addr)
	//{
	//	var data = new Array();
	//	for (var i = 0; i < dataResponse.devices.length; i++)
	//	{
	//		var device = dataResponse.devices[i];
	//		if (device.Address == addr)
	//			for (var n = 0; n < device.Bandwidth.length; n++)
	//			{
	//				var record = device.Bandwidth[n];
	//				var x = new Date(record.Time);
	//				var y = bytesToKilobits(record.Download);
	//				data.push({ name: x.toString(), value: [x, y] });
	//			}
	//	}
	//	return data;
	//}
	//function GetSeries2(index)
	//{
	//	return {
	//		name: dataResponse.devices[index].Address,
	//		type: 'line',
	//		showSymbol: false,
	//		hoverAnimation: false,
	//		stack: "bw",
	//		areaStyle: { normal: {} },
	//		data: GetData2(index)
	//	}
	//}
	//function GetData2(index)
	//{
	//	var data = new Array();
	//	var device = dataResponse.devices[index];
	//	for (var n = 0; n < device.Bandwidth.length; n++)
	//	{
	//		var record = device.Bandwidth[n];
	//		var x = new Date(record.Time);
	//		var y = bytesToKilobits(record.Download);
	//		data.push({ name: x.toString(), value: [x, y] });
	//	}
	//	return data;
	//}
	///////////////////////////////////////////////////////////////
	// Modal //////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////
	function showModal(title, htmlOrEleContent)
	{
		var $modal = $('<div class="modal" id="myModal" tabindex="-1" role="dialog" aria-labelledby="myModalLabel">'
			+ '  <div class="modal-dialog modal-lg" role="document">'
			+ '    <div class="modal-content">'
			+ '      <div class="modal-header">'
			+ '        <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>'
			+ '        <h4 class="modal-title" id="myModalLabel"></h4>'
			+ '      </div>'
			+ '      <div class="modal-body">'
			+ '      </div>'
			+ '      <div class="modal-footer">'
			+ '        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>'
			+ '      </div>'
			+ '    </div>'
			+ '  </div>'
			+ '</div>')
		$modal.find("#myModalLabel").append(title);
		$modal.find(".modal-body").append(htmlOrEleContent);
		$('body').append($modal);
		$modal.modal();
	}
	///////////////////////////////////////////////////////////////
	// Custom Render //////////////////////////////////////////////
	///////////////////////////////////////////////////////////////
	function RenderBandwidth(item, editable, fieldName)
	{
		return formatBytes(item[fieldName]);
	}
	function RenderPercent(item, editable, fieldName)
	{
		return item[fieldName] + "%";
	}
	function RenderAge(item, editable, fieldName)
	{
		return msToRoughTimeString(Date.now() - item.Timestamp)
	}
	function RenderMBtoMiB(item, editable, fieldName)
	{
		return MB_To_MiB(item[fieldName], 0) + " MiB";
	}
	function RenderDec1(item, editable, fieldName)
	{
		return item[fieldName].toFixedLoose(1);
	}
	///////////////////////////////////////////////////////////////
	// Misc ///////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////
	String.prototype.startsWith = function (prefix)
	{
		return this.lastIndexOf(prefix, 0) === 0;
	}
	String.prototype.endsWith = function (suffix)
	{
		var idx = this.lastIndexOf(suffix);
		return idx != -1 && idx == (this.length - suffix.length);
	}
	Number.prototype.toFixedLoose = function (decimals)
	{
		return parseFloat(this.toFixed(decimals));
	}
	function MB_To_MiB(MB, fixedPrecision)
	{
		var B = MB * 1000000;
		var MiB = B / 1048576;
		if (typeof fixedPrecision == "number")
			return MiB.toFixed(fixedPrecision);
		else
			return MiB;
	}
	function msToTimeString(totalMs)
	{
		var ms = totalMs % 1000;
		var totalS = totalMs / 1000;
		var totalM = totalS / 60;
		var totalH = totalM / 60;
		var totalD = totalH / 24;
		//var s = Math.floor(totalS) % 60;
		var m = Math.floor(totalM) % 60;
		var h = Math.floor(totalH) % 24;
		var d = Math.floor(totalD);

		var retVal = "";
		if (d != 0)
			retVal += d + " day" + (d == 1 ? "" : "s") + ", ";
		if (d != 0 || h != 0)
			retVal += h + " hour" + (h == 1 ? "" : "s") + ", ";
		retVal += m + " minute" + (m == 1 ? "" : "s");
		return retVal;
	}
	function msToRoughTimeString(totalMs)
	{
		var ms = totalMs % 1000;
		var totalS = totalMs / 1000;
		var totalM = totalS / 60;
		var totalH = totalM / 60;
		var totalD = totalH / 24;
		var s = Math.floor(totalS) % 60;
		var m = Math.floor(totalM) % 60;
		var h = Math.floor(totalH) % 24;
		var d = Math.floor(totalD);

		if (d != 0)
			return d + " day" + (d == 1 ? "" : "s");
		if (h != 0)
			return h + " hour" + (h == 1 ? "" : "s");
		if (m != 0)
			return m + " minute" + (m == 1 ? "" : "s");
		return s + " second" + (s == 1 ? "" : "s");
	}
	function formatBytes(bytes)
	{
		if (bytes == 0) return '0 bps';
		var negative = bytes < 0;
		if (negative)
			bytes = -bytes;
		var bits = bytes * 8;
		var k = 1000,
			dm = typeof decimals != "undefined" ? decimals : 1,
			sizes = ['b', 'Kb', 'Mb', 'Gb', 'Tb', 'Pb', 'Eb', 'Zb', 'Yb'],
			i = Math.floor(Math.log(bits) / Math.log(k));
		var highlight;
		if (bits > 100000000) // > 100 Mbps
			highlight = "extreme";
		else if (bits > 20000000) // > 20 Mbps
			highlight = "veryhigh";
		else if (bits > 1000000) // > 1 Mbps
			highlight = "high";
		else if (bits > 50000) // > 50 Kbps
			highlight = "med";
		else // < 50 Kbps
			highlight = "low";
		return '<span style="display: none;">' + bytes + ' </span><span class="bits_' + highlight + '">' + (negative ? '-' : '') + (bits / Math.pow(k, i)).toFloat(dm) + " " + sizes[i] + 'ps</span>';
	}
	function bytesToKilobits(bytes)
	{
		return bytes / 125;
	}
	function formatBytes2(bytes, decimals)
	{
		if (bytes == 0) return '0B';
		var negative = bytes < 0;
		if (negative)
			bytes = -bytes;
		var k = 1000,
			dm = typeof decimals != "undefined" ? decimals : 1,
			sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
			i = Math.floor(Math.log(bytes) / Math.log(k));
		return '<span style="display: none;">' + bytes + ' </span><span class="bytes_' + sizes[i] + '">' + (negative ? '-' : '') + (bytes / Math.pow(k, i)).toFloat(dm) + " " + sizes[i] + '/s</span>';
	}
	String.prototype.toFloat = function (digits)
	{
		return parseFloat(this.toFixed(digits));
	};
	Number.prototype.toFloat = function (digits)
	{
		return parseFloat(this.toFixed(digits));
	};
	var use24HourTime = false;
	function GetTimeStr(date, includeMilliseconds)
	{
		var ampm = "";
		var hour = date.getHours();
		if (!use24HourTime)
		{
			if (hour == 0)
			{
				hour = 12;
				ampm = " AM";
			}
			else if (hour == 12)
			{
				ampm = " PM";
			}
			else if (hour > 12)
			{
				hour -= 12;
				ampm = " PM";
			}
			else
			{
				ampm = " AM";
			}
		}
		var ms = includeMilliseconds ? ("." + date.getMilliseconds()) : "";

		var str = hour.toString().padLeft(2, '0') + ":" + date.getMinutes().toString().padLeft(2, '0') + ":" + date.getSeconds().toString().padLeft(2, '0') + ms + ampm;
		return str;
	}
	String.prototype.padLeft = function (len, c)
	{
		var pads = len - this.length;
		if (pads > 0)
		{
			var sb = [];
			var pad = c || "&nbsp;";
			for (var i = 0; i < pads; i++)
				sb.push(pad);
			sb.push(this);
			return sb.join("");
		}
		return this;

	};
	String.prototype.padRight = function (len, c)
	{
		var pads = len - this.length;
		if (pads > 0)
		{
			var sb = [];
			sb.push(this);
			var pad = c || "&nbsp;";
			for (var i = 0; i < pads; i++)
				sb.push(pad);
			return sb.join("");
		}
		return this;
	};
	Number.prototype.padLeft = function (len, c)
	{
		return this.toString().padLeft(len, c);
	};
	Number.prototype.padRight = function (len, c)
	{
		return this.toString().padRight(len, c);
	};
	var escape = document.createElement('textarea');
	var EscapeHTML = function (html)
	{
		escape.textContent = html;
		return escape.innerHTML;
	}
	var UnescapeHTML = function (html)
	{
		escape.innerHTML = html;
		return escape.textContent;
	}
	function ExecAPI(cmd, callbackSuccess, callbackFail)
	{
		var reqUrl = "api/" + cmd;
		$.ajax({
			type: 'POST',
			url: reqUrl,
			contentType: "text/plain",
			data: "",
			dataType: "json",
			success: function (data)
			{
				if (callbackSuccess)
					callbackSuccess(data);
			},
			error: function (jqXHR, textStatus, errorThrown)
			{
				if (!jqXHR)
					jqXHR = { status: 0, statusText: "No jqXHR object was created" };
				jqXHR.OriginalURL = reqUrl;
				jqXHR.ErrorMessageHtml = 'Response: ' + jqXHR.status + ' ' + jqXHR.statusText + '<br>Status: ' + textStatus + '<br>Error: ' + errorThrown + '<br>URL: ' + reqUrl;
				if (callbackFail)
					callbackFail(jqXHR, textStatus, errorThrown);
			}
		});
	}
	return this;
})(jQuery);