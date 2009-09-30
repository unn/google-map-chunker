// ##########################################################################
// # XLog
// # Kind of like GLog, only you can see more than 5 lines and no bloody date/time!
XLog = new Object;
XLog.enabled = false;
XLog.dumpObject = function (t,o,c) {
	if (!XLog.enabled)
		return;

	t+=">> ";
	for( k in o ) {
		t += " "+k+":"+o[k];
	}
	XLog.debug(t,c);
}

XLog.openDebugWindow = function () {
	if (!XLog.enabled || XLog._element!=undefined)
		return;

	var dbg = "<div id=\"dbgHeader\"><span onclick=\"XLog.clear()\">clear</span> | <span onclick=\"XLog.width('90%')\">wide</span> | <span onclick=\"XLog.width('200px')\">thin</span> | <span onclick=\"XLog.height('1%')\">^</span> | <span onclick=\"XLog.height('95%')\">V</span></div>";
	dbg += "<div><div id=\"dbg\"></div></div>";
	var div = document.createElement( "div" );
	div.id = "dbgContainer";
	div.innerHTML = dbg;
	document.body.appendChild( div );

	XLog._element = document.getElementById('dbg');
}

XLog.debug = function ( msg, color ) {
	if (!XLog.enabled)
		return;

	if ( XLog._element==undefined )
		XLog.openDebugWindow();

	var div = document.createElement( "div" );
	if (color!=undefined)
		div.style.color = color;
	div.innerHTML = msg;

	XLog._element.appendChild( div );
	XLog._element.scrollTop = XLog._element.scrollHeight - XLog._element.clientHeight;
}

XLog.clear = function() {
	if ( XLog._element!=undefined )
		XLog._element.innerHTML = "";
}

XLog.width = function(w) {
	var div = document.getElementById("dbgContainer");
	if ( div!=null )
		div.style.width = w;
}

XLog.height = function(w) {
	var div = document.getElementById("dbgContainer");
	if ( div!=null )
		div.style.height = w;
}

// ##########################################################################
// # Rectangle
// # Simple overlay of the bounds of a map chunk,
// # with text and a color representing the state
// # adapted from the sample at the google maps api page
function Rectangle(bounds, text) {
	this.bounds_ = bounds;
	this.text_ = text;
}
Rectangle.prototype = new GOverlay();

Rectangle.prototype.initialize = function(map) {
	var bgDiv = document.createElement("div");
	bgDiv.className = 'chunkColorBox';

	var textDiv = document.createElement("div");
	textDiv.className = 'chunkTextBox';
	var spanText = document.createElement("span");
	spanText.className = 'chunkTextSpan';
	spanText.innerHTML = this.text_;
	textDiv.appendChild(spanText);

	var pane = map.getPane(G_MAP_MAP_PANE);
	pane.appendChild(bgDiv);
	pane.appendChild(textDiv );

	this.map_ = map;
	this.textDiv_ = textDiv;
	this.bgDiv_ = bgDiv;
}

Rectangle.prototype.remove = function() {
	this.bgDiv_.parentNode.removeChild(this.bgDiv_);
	this.textDiv_.parentNode.removeChild(this.textDiv_);
}

Rectangle.prototype.copy = function() {
	return new Rectangle(this.bounds_, this.text_);
}

Rectangle.prototype.redraw = function(force) {
	if (!force) return;
	var c1 = this.map_.fromLatLngToDivPixel(this.bounds_.getSouthWest());
	var c2 = this.map_.fromLatLngToDivPixel(this.bounds_.getNorthEast());
	c2.x--;
	c2.y++;
	this.bgDiv_.style.width = Math.abs(c2.x - c1.x) + "px";
	this.bgDiv_.style.height = Math.abs(c2.y - c1.y) + "px";
	this.bgDiv_.style.left = (Math.min(c2.x, c1.x)+1) + "px";
	this.bgDiv_.style.top = (Math.min(c2.y, c1.y)+1) + "px";
	this.textDiv_.style.margin = ((Math.abs(c2.y - c1.y)-14)/2)+"px 0px 0px 0px";
	this.textDiv_.style.width = this.bgDiv_.style.width;
	this.textDiv_.style.height = this.bgDiv_.style.height;
	this.textDiv_.style.left = this.bgDiv_.style.left;
	this.textDiv_.style.top = this.bgDiv_.style.top;
}

Rectangle.prototype.setBGColor = function(color) {
	this.bgDiv_.style.background = color;
}

Rectangle.prototype.setText = function(text) {
	this.textDiv_.firstChild.innerHTML = text;
}

// ##########################################################################
// # NotifyControl
// #

function NotifyControl(printable, selectable) {
}

NotifyControl.prototype.printable = function() {
	return false;
}

NotifyControl.prototype.selectable = function() {
	return true;
}

NotifyControl.prototype.getDefaultPosition = function() {
	return G_ANCHOR_TOP_RIGHT;
}

NotifyControl.prototype.allowSetVisibility = function() {
	return true;
}

NotifyControl.prototype.initialize = function(map) {
	var div = document.createElement("div");
	div.id = "notifyControl";
	map.getContainer().appendChild(div);
	this.div_ = div;
	return div;
}

NotifyControl.prototype.setText = function(text) {
	if (text=='')
		this.div_.style.display = 'none' ;
	else {
		this.div_.innerHTML = text;
		if (this.div_.style.display != 'block')
			this.div_.style.display = 'block';
	}
}

// #####################################
//

var __chunker=null;		// global variable, only used by the javascript link to clear server error

function GoogleMapDBChunker(map,options,text) {
	__chunker = this;
	this.map = map;
	this._debug = options._debug;
	this.text = text;
	this.bounds=null;
	this.chunkedBounds=new Object;
	this.extendedBounds=null;
	this.sites=new Object;
	this.sites_i=new Object;
	this.visibleSites = new Object;
	this.neededCount=0;
	this.recalcVisible=0;
	this.newChunkHandlerTimeout = 0;
	this.refreshSitesTimeoutId=0;
	this.runningServerQueries=false;
	this.inRefreshSites = false;				// stop __refreshSites being entered twice (rare, but avoid it)
	this.errorCode=0;
	this.notifyControl = new NotifyControl();

	// default options
	this.options = {
					minZoomUpdate: 8,				// At this zoom and below, do not do any updates (very slow with half degree chunks)
					minZoomForServer: 9,			// do not load data from server if zoom is lower than this
					chunkAreaZoom: 9,				// if zoom at this level or below;remove individual items and replace with a chunk
					maxConcurrentServerRequests: 2,
					notifyControlPosition: G_ANCHOR_TOP_RIGHT,
					notifyControlOffset: new GSize(10, 30)
					};

	// merge in user options;
	for( var option in options )
		this.options[option] = options[option];

	this.viewingAreas = this.map.getZoom() <= this.options.chunkAreaZoom;				// currently showing chunks as areas?


	//(all chunknames in this section)
	this.needed=new Object;				// chunks we need from the server
	this.refreshQ = new Object;			// chunks waiting to be 'refreshed' (i.e. items added/removed;chunk on screen)
	this.processedChunks = new Object;	// chunks that have been refreshed
	this.removeQ = new Object;			// queue of chunks waiting to be removed from this.processedChunks and have all items removed (chunk off screen)
	this.visibleChunks = new Object;	// list of visible chunks
	this.chunkBounds = new Object;		// GLatLongBounds of chunk

	this.CHUNK_STATE_LOADED=0;this.CHUNK_STATE_FOR_REFRESH=1;this.CHUNK_STATE_REFRESHED=2;this.CHUNK_STATE_REMOVED=3;
	this.CHUNK_BOUNDS_STATE_INTERSECTS=1;this.CHUNK_BOUNDS_STATE_CONTAINED=2;

	this.map.addControl( this.notifyControl,
		new GControlPosition(this.options.notifyControlPosition, this.options.notifyControlOffset));

	var obj = this;
	GEvent.addListener(map, "moveend", function() { obj.onMapChangeView(); } );
	GEvent.addListener(map, "zoomend", function() { obj.onMapChangeView(); } );

}

GoogleMapDBChunker.prototype.formatString = function() {
	var rv = arguments[0];
	for (var i = 1; i < arguments.length; i++) {
		var regex = new RegExp( "\\%"+i+"\\$s", "g");
		rv = rv.replace( regex, arguments[i]);
	}
	return rv;
}

GoogleMapDBChunker.prototype.onMapChangeView = function() {
	if ( map.getZoom()<=this.options.minZoomUpdate ) {
		this.updateStatus();
		return;
	}

	this.getMapBounds();
	this.updateStatus();

	this.refreshSites();
}

GoogleMapDBChunker.prototype.addChunkToRefreshQ = function( chunkname ) {
	if (this._debug)
		this.updateChunkMarker( chunkname, this.CHUNK_STATE_FOR_REFRESH );
	this.refreshQ[chunkname]=1;
}

GoogleMapDBChunker.prototype.getMapBounds = function() {
	// bit of a fudge up, converted from original VE compatible code.
	// saves changing the rest of the working code and introducing errors

	var gmBounds = this.map.getBounds();
	var northEast = gmBounds.getNorthEast();
	var southWest = gmBounds.getSouthWest();

	this.bounds = { long1: southWest.lng(), lat1: northEast.lat(),
				long2: northEast.lng(), lat2: southWest.lat() };

	this.chunkedBounds.long1 = Math.floor((this.bounds.long1+180.0)*2.0)/2.0*10;
	this.chunkedBounds.lat1 = Math.floor((this.bounds.lat1+90.0)*2.0)/2.0*10;
	this.chunkedBounds.long2 = Math.floor((this.bounds.long2+180.0)*2.0)/2.0*10;
	this.chunkedBounds.lat2 = Math.floor((this.bounds.lat2+90.0)*2.0)/2.0*10;

//	XLog.dumpObject(this.chunkedBounds);

	// extended this.bounds is the area which markers can exist in. For large zoom levels
	// we can double the current this.map this.bounds to make sure icons scroll into view.
	// when zoomed out, reduce the size to reduce number of markers.

	if (this.map.getZoom()>=9) {
		this.extendedBounds = gmBounds;
	} else
		this.extendedBounds = gmBounds;

	//  now generate a list of chunks
	var newVisibleChunks = new Object();
	var chunk;

	// Determine visible chunks, mark if this.needed to be downloaded
	// if current visible is in this.visibleChunks(old), remove them from there
	for( lat = this.chunkedBounds.lat1; lat>=this.chunkedBounds.lat2; lat-=5 ) {
		for( lng = this.chunkedBounds.long1; lng<=this.chunkedBounds.long2; lng+=5 ) {
			var index = lng*10000 + lat;
			newVisibleChunks[index]= this.extendedBounds.containsBounds( this.getChunkBounds(index) ) ? this.CHUNK_BOUNDS_STATE_CONTAINED : this.CHUNK_BOUNDS_STATE_INTERSECTS;
		}
	}

	// clean the this.needed queue
	this.needed = new Object();
	this.neededCount = 0;

	// clean the refresh queue
	this.refreshQ = new Object();

	// this.visibleChunks is at the moment, the old window
	for( chunk in this.visibleChunks ) {
		// if the chunk has been processed and is not in the newly visible, mark to have its items removed
		if ( this.processedChunks.hasOwnProperty(chunk) && !newVisibleChunks.hasOwnProperty(chunk) )
			this.removeQ[chunk]=1;
	}

	// are we showing chunkAreas rather than items?
	var nowViewingAreas = this.map.getZoom() <= this.options.chunkAreaZoom;
	var areasStateChanged = nowViewingAreas != this.viewingAreas;

	for( chunk in newVisibleChunks ) {
		// if the visible is in this.removeQ, remove from this.removeQ
		if ( this.removeQ.hasOwnProperty(chunk) )
			delete this.removeQ[chunk];

		//either shedule for loading from server, or refreshing
		if ( this.sites[chunk]==undefined ) {
			if ( this.map.getZoom() >= this.options.minZoomForServer ) {
				if (this.needed[chunk]!=1) {
					this.needed[chunk]=1;
					this.neededCount++;
				}
			}
		} else {
			// if the chunk has been processed and was FULLY in both
			// the old and new rectangles, AND either
			// the area state has not changed OR (we are now viewing as an area AND the chunk is not shown as an area)
			// no refresh will be this.needed
			if ( this.processedChunks[chunk]==1 &&
					newVisibleChunks[chunk]==this.CHUNK_BOUNDS_STATE_CONTAINED &&
					this.visibleChunks[chunk]==this.CHUNK_BOUNDS_STATE_CONTAINED &&
					(!areasStateChanged || (this.nowViewingAreas && !this.sites[chunk].shownAsArea)) )
				continue;

			this.addChunkToRefreshQ(chunk);
		}
	}

	this.viewingAreas = nowViewingAreas;

	this.visibleChunks = newVisibleChunks;
	XLog.dumpObject("getMapBounds, this.visibleChunks=",this.visibleChunks);
}

// get the 1st thing you can find from the object
GoogleMapDBChunker.prototype.getFirstFromObject = function(object) {
	var found = null;
	for( var item in object ) {
		found = item;
		break;
	}
	return found;
}

GoogleMapDBChunker.prototype.limitLat = function(l) {
	if ( l>90.0 )
		return 90.0;
	if ( l<-90.0 )
		return -90.0;
	return l;
}

GoogleMapDBChunker.prototype.sortSites = function( a, b ) {
	return a.st-b.st;
}

// ##########################################################################
// # Methods for communicating with the server
// #

// fetch the next this.needed item from the this.needed list
GoogleMapDBChunker.prototype.queryServer = function() {
	var changed = false;

	while( this.neededCount>0 && this.runningServerQueries<this.options.maxConcurrentServerRequests && this.errorCode==0 ) {
		this.runningServerQueries++;

		space = this.getFirstFromObject(this.needed);
		if ( space==null )
			break;

		var obj = this;
		var url = this.options.serverURL+"?chunk="+space;
		GDownloadUrl( url, function(a,b) {obj.showResponse(a,b);} );

		delete this.needed[space];
		this.neededCount--;
		changed = true;
	}

	if (changed) {
		this.updateStatus();
		this.refreshSites();
	}
}

// ajax response received. do actual processing in a timeouted function, fixes odd browser behaviour
GoogleMapDBChunker.prototype.showResponse = function(response, responseCode) {
	XLog.debug("showResponse "+this);
	this.runningServerQueries--;
	if ( responseCode!=200 && responseCode!=304 ) {
		this.updateStatus( responseCode );
		return;
	}
	var result = null;
	try {
		result = eval( "( " + response + ")" );
	} catch (e) {
		this.updateStatus( this.text.invalidJSONResponse );
	}
	if (result !=null ) {
		var obj = this;
		setTimeout( function() {obj.handleResponse(result);}, 10);
		if (this.neededCount>0)
			this.queryServer();
//		this.queryServer();
		this.refreshSites();
	} else
		this.updateStatus( this.text.invalidServerData );
}

// got results back from server after timeout
GoogleMapDBChunker.prototype.handleResponse = function(result) {
	var chunkname = result.contains;

	var items=result[chunkname];
	if ( this.sites[chunkname]!=undefined ) {
		// in rare instances we seem to get a double notification in some browsers, just ignore it
		return;
	}
	this.sites[chunkname] = { items: items, initialized: false, marker: null, shownChunked: false };

	if (this._debug) {
		this.createChunkMarker( chunkname );
		this.updateChunkMarker( chunkname, this.CHUNK_STATE_LOADED );
	}

	XLog.debug("HandleResponse for "+chunkname);

	// if the chunk is visible, add it to the this.refreshQ
	if ( this.visibleChunks[chunkname]!=undefined )
		this.addChunkToRefreshQ(chunkname);
}

// ##########################################################################
// # Methods displaying chunk items, and the main refesh processing loop
// #

// Schedule a call to refresh the this.sites on a timer
GoogleMapDBChunker.prototype.refreshSites = function() {
	if (this.refreshSitesTimeoutId!=0) {
		// we are currently waiting for a refresh this.sites, so cancel the timer and reschedule
		clearTimeout(this.refreshSitesTimeoutId);
	}
	var obj = this;
	this.refreshSitesTimeoutId = setTimeout( function() { obj._refreshSites() } , 10 );
}

// wrap the actual call to refresh this.sites to make sure we don't get
// re-entrant problems
GoogleMapDBChunker.prototype._refreshSites = function() {
	this.refreshSitesTimeoutId = 0;
	if (this.inRefreshSites) {
		// if we end up nesting into this function, schedule another call on timer and quit
		this.refreshSites();
		return;
	}
	this.inRefreshSites = true;

	// check if we are after more data
	this.queryServer();

	this.dumpInternalStatus("__refreshSites IN ", 'red' );

	this.__refreshSites();

	this.dumpInternalStatus("__refreshSites OUT ", 'blue' );

	this.inRefreshSites = false;

}
GoogleMapDBChunker.prototype.__refreshSites = function() {
	this.recalcVisible=-1;
	this.updateStatus();

	var chunk = this.getFirstFromObject( this.refreshQ );
	if (chunk!=null) {
		delete this.refreshQ[chunk];
		this.refreshChunk(chunk);
	}

	// run refresh again? always handle new markers before removing old
	var hasRefreshChunks = this.getFirstFromObject(this.refreshQ)!=null;
	if ( hasRefreshChunks ) {
		this.refreshSites();
		return;
	}

	XLog.dumpObject("this.removeQ",this.removeQ,'yellow');
	chunk = this.getFirstFromObject( this.removeQ );
	if (chunk!=null) {
		delete this.removeQ[chunk];
		this.removeChunkMarkers(chunk,true);
	}

	hasMoreToRemove = this.getFirstFromObject( this.removeQ )!=null;

	if ( hasMoreToRemove ) {
		this.refreshSites();
		return;
	}

	this.recalcVisible=0;
	this.updateStatus();
}

// Refresh the chunk
GoogleMapDBChunker.prototype.refreshChunk = function(chunkname) {
	if ( !this.sites[chunkname].initialize )
		this.initializeChunk(chunkname);

	// are we showing chunks rather than items?
	if ( this.viewingAreas ) {
		if ( !this.sites[chunkname].shownAsArea )
			this.showChunkAsArea(chunkname);
	} else {
		if ( this.sites[chunkname].shownAsArea )
			this.removeChunkAsArea(chunkname);
		this.addRemoveChunkItems(chunkname);
	}
}

// shows the chunk as an area with some text instead of individual markers
GoogleMapDBChunker.prototype.showChunkAsArea = function( chunkname ) {
	this.removeChunkMarkers( chunkname, false );

	var items = this.sites[chunkname].items;
	var count = items!=undefined ? items.length : 0;
	if (count>0) {
		this.createChunkMarker(chunkname);
		this.sites[chunkname].marker.setText( this.formatString(this.text.sites,this.sites[chunkname].items.length) );
	}

	this.sites[chunkname].shownAsArea = true;
}

GoogleMapDBChunker.prototype.removeChunkAsArea = function( chunkname ) {
	if (this.sites[chunkname].marker!=null) {
		if ( this._debug )
			this.sites[chunkname].marker.setText( "" );
		else {
			this.map.removeOverlay(this.sites[chunkname].marker);
			this.sites[chunkname].marker = null ;
		}
	}
	this.sites[chunkname].shownAsArea = false;
}

// add/remove this.sites inside the chunk if necessary
GoogleMapDBChunker.prototype.addRemoveChunkItems = function( chunkname ) {
	var chunkVisibilityFlag = this.visibleChunks[chunkname];
	var items = this.sites[chunkname].items;
	var obj = this;

	var len = items.length;

	for(i=0; i<len; i++) {
		var site = items[i];

		// is in view area?
		var visible = (chunkVisibilityFlag==this.CHUNK_BOUNDS_STATE_CONTAINED) ? true : this.extendedBounds.contains( site.latlng );

		 if ( !visible ) {
			if (site.marker!=null ) {
				delete this.visibleSites[site.i];
				this.map.removeOverlay(site.marker);
				site.marker = null;
			}
			continue;
		}

		if ( site.marker!=null)
			continue;


		site.marker = new GMarker( new GLatLng(site.lt, site.ln) ); //, disabledIcon );
		site.marker.siteId = site.i;
		GEvent.addListener(site.marker, "click", function() { obj.markerClick(obj.sites_i[this.siteId]); } );
		this.map.addOverlay( site.marker );
		this.visibleSites[site.i] = site;
	}
	this.processedChunks[chunkname] =1;
	if (this._debug)
		this.updateChunkMarker( chunkname, this.CHUNK_STATE_REFRESHED );
}

// Remove all markers in the chunk
// RemoveFromProcessedList is false when converting to an area
GoogleMapDBChunker.prototype.removeChunkMarkers = function(chunkname, removeFromProcessedList ) {
	var items = this.sites[chunkname].items;
	var len = items!=undefined ? items.length : 0;

	for(i=0; i<len; i++) {
		var site = items[i];
		if ( site.marker==null )
			continue;

		delete this.visibleSites[site.i];
		this.map.removeOverlay(site.marker);
		site.marker = null;
	}

	if ( removeFromProcessedList ) {
		delete this.processedChunks[chunkname];
		if (this._debug)
			this.updateChunkMarker( chunkname, this.CHUNK_STATE_REMOVED );
	}
}

// #####################################

// Initialize information in the chunk
GoogleMapDBChunker.prototype.initializeChunk = function(chunkname) {
	var items = this.sites[chunkname].items;
	var len = items!=undefined ? items.length : 0;

	for(i=0; i<len; i++) {
		var site = items[i];
		this.sites_i[site.i] = site;
		site.latlng = new GLatLng( site.lt, site.ln );
		site.chunk = chunkname;
	}

	this.sites[chunkname].initialized = true;
}

GoogleMapDBChunker.prototype.getChunkBounds = function( chunkname ) {
	if ( typeof chunkname == 'number' )
		chunkname = new String(chunkname);

	if ( this.chunkBounds[chunkname]!=undefined )
		return this.chunkBounds[chunkname];

	var lng = (parseFloat( chunkname.slice(0,4) )/10)-180;
	var lat = (parseFloat( chunkname.slice(4,9) )/10)-90;

	var rectBounds = new GLatLngBounds(
		new GLatLng(lat, lng),
		new GLatLng(lat+0.5, lng+0.5));

	this.chunkBounds[chunkname] = rectBounds;
	return rectBounds;
}

GoogleMapDBChunker.prototype.createChunkMarker = function( chunkname, text ) {
	if (text==undefined)
		text='';
	if ( this.sites[chunkname].marker==null ) {
		this.sites[chunkname].marker = new Rectangle( this.getChunkBounds(chunkname),text );
		this.map.addOverlay(this.sites[chunkname].marker);
	}
}

GoogleMapDBChunker.prototype.updateChunkMarker = function(index,state) {
	if ( !this._debug )
		return;
	var color = "#808080";
	switch( state ) {
		case this.CHUNK_STATE_LOADED:
			color = "#800000";
			break;
		case this.CHUNK_STATE_FOR_REFRESH:
			color = "#008080";
			break;
		case this.CHUNK_STATE_REFRESHED:
			color = "#000080";
			break;
		case this.CHUNK_STATE_REMOVED:
			color = "#800080";
			break;
	}
	this.sites[index].marker.setBGColor(color);

}

GoogleMapDBChunker.prototype.updateStatus = function(newcode) {
	if (newcode!=undefined)
		this.errorCode = newcode;

	var statusText="";

	if ( typeof this.errorCode == 'number' && this.errorCode==0 ) {
		if ( this.neededCount>0 ) {
			statusText = this.formatString( this.text.loadingFromServer, this.neededCount );
		} else if ( this.recalcVisible==-1 ) {
			statusText = this.text.refreshing;
		}

		if ( this.map.getZoom() < this.options.minZoomForServer )
			statusText = this.text.noLoadTooFarOut;
	} else {
		var link = '<a href="javascript:void%20__chunker.clearError()">' + this.text.tryAgain + '</a>';
		statusText = this.formatString( this.text.serverResponseError, this.errorCode, link );
	}

	window.status = statusText;
	this.notifyControl.setText(statusText);
}

GoogleMapDBChunker.prototype.clearError = function() {
	this.errorCode = 0;
	this.queryServer();
}

GoogleMapDBChunker.prototype.dumpInternalStatus = function( title, color ) {
	if ( XLog.enabled==false )
		return;

	XLog.debug(">>>>Status :"+title,color);
	XLog.dumpObject("this.refreshQ", this.refreshQ, color);
	XLog.dumpObject("this.removeQ", this.removeQ, color);
	XLog.dumpObject("this.processedChunks", this.processedChunks, color );
	XLog.dumpObject('this.visibleChunks', this.visibleChunks, color );
	XLog.dumpObject('this.needed',this.needed, color );
	XLog.debug("<<<< "+title,color );
}

