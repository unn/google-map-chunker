<?php
/*error_reporting(E_ALL);
ini_set('display_errors', TRUE);
ini_set('display_startup_errors', TRUE); */

header("Cache-Control: max-age=120");
require_once "googleMapDBChunkerCache.php";

//
// Data source name to your database (this WILL need to be changed)
//
define( CHUNKER_DSN, 'mysql://root:root@localhost/sites' );

//
// Here you can enable GZipping out output data, which is very
// useful if you are caching it as well (stored gzipped in cache)
// Some ISPs do not allow calling encoding functions from scripts
// so you can turn it off here. Note if you are flipping the status of
// this and you are using a cache - CLEAR THE CACHE :)
//
// Note that i dont actually check if the browser supports gzip,
// i would have thought that any browser that can handle the complexity
// of google maps should have gzip decoding...
//
$enable_gzipping = true;
$gz_encode_level = 9;

//
// Validate request
$space = (int) $_REQUEST['chunk'];
$long = (int) ($space / 10000);
$longLast = $long % 10;
$lat = $space % 10000;
$latLast = $lat % 10;
if ( $lat<0 || $lat>1800 || $long <0 || $long>3600 ||
	!($latLast==0 || $latLast==5) ||
	!($longLast==0 || $longLast==5 ) ) {
	header("HTTP/1.0 400 Bad Request");
	print "Bad Request";
	exit;
}

$space = sprintf("%04d%04d", $long, $lat );
$cache = getGoogleMapDBChunkerCache();

if ( $cache==null || !($data = $cache->get( $space )) ) {
	// not in cache or no cache
	$data = getChunkData( $space );
	if ($enable_gzipping)
		$data = gzencode ( $data, $gz_encode_level );
	if ( $cache!=null )
		$cache->save( $data, $space );
} else {
	// the data is cached in the server
	// now check client cached time against data time
	$since = 0;
	if ($_SERVER['HTTP_IF_MODIFIED_SINCE']!='')
		$since = strtotime(current($array = explode(';', $_SERVER['HTTP_IF_MODIFIED_SINCE'])));

	if ( $cache->lastModified() == $since ) {
		// the browser has the information already
		header("Last-Modified: ".HTTPDate( $fileModtime ) );
		header("HTTP/1.0 304 Not Modified");
		die;
	}
}

if ( $cache!=null )
	header("Last-Modified: ".HTTPDate( $cache->lastModified() ) );
if ($enable_gzipping)
	header("Content-Encoding: gzip");
header("Content-Type: text/plain");
header("Content-Length: ".strlen($data) );
echo $data;
die;

//
// Retrieve a chunk from the DB
// Uses PEAR::DB
//
// Modify this to output any information you need to send to the client
// for when they say click a marker. Here 'name' is used
//
// Output is in JSON
//
//
function getChunkData( $space ) {
	$db = &openDB();

	$sql = "SELECT id,name,s_lat,s_long FROM sites WHERE half_degree_index=?";
	$res =& $db->query( $sql, array($space) );
	if (DB::isError($res))
		die("query ".$res->getMessage());

	ob_start();
	print "{\r\n  contains: \"$space\",\r\n";
	print "  \"$space\": [ \r\n";

	$count=0;
	while( $row = & $res->fetchRow() ) {
		$name = str_replace( "\"", "\"\"", $row['name'] );
		if ($count++ >0 )
			print ",\r\n";
		print "    {i: \"{$row['id']}\", lt: {$row['s_lat']}, ln: {$row['s_long']}, name: \"".htmlspecialchars($name)."\" }";
	}

	print "\r\n  ]\r\n}";
	$data = ob_get_contents();
	ob_end_clean();
	return $data;
}

//
// Open the PEAR::DB database
//
function &openDB() {
	require_once "DB.php";

	$options = array(
		'portability' => DB_PORTABILITY_LOWERCASE | DB_PORTABILITY_RTRIM,
		'persistent'  => true
	);

	$db = DB::connect(CHUNKER_DSN, $options);
	if (DB::isError($db))
		die( "connect ".$db->getMessage());
	$db->setFetchMode(DB_FETCHMODE_ASSOC);

	return $db;
}

//
//return GMT date used in HTTP headers
//
function HTTPDate($time = 0) {
	if ($time==0)
		$time = time();

	return gmdate('D, d M Y H:i:s \G\M\T', $time);
}

?>