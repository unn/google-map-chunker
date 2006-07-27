<?
//
// To turn on chunk caching, set CHUNKER_CACHE_ENABLE to true
// and CHUNKER_CACHE_DIRECTORY to a valid location, that the webserver
// has WRITE access to
//
define( CHUNKER_CACHE_ENABLE, true );
define( CHUNKER_CACHE_DIRECTORY, $_SERVER["DOCUMENT_ROOT"].'/cache/' );
define( CHUNKER_CACHE_GLOBAL_NAME, 'googleMapDBChunkerCache' );

function &getGoogleMapDBChunkerCache() {
	if ( !CHUNKER_CACHE_ENABLE )
		return null;

	if ( isset($GLOBALS[CHUNKER_CACHE_GLOBAL_NAME]) )
		return $GLOBALS[CHUNKER_CACHE_GLOBAL_NAME];

	require_once 'Cache/Lite.php';
	$options = array(
						'cacheDir' => CHUNKER_CACHE_DIRECTORY,
						'lifeTime' => 999999,
						'fileNameProtection' => false,
						'automaticSerialization' => false,
						'hashedDirectoryLevel' => 3,
						'pearErrorMode' => CACHE_LITE_ERROR_RETURN );

	$cache = new Cache_Lite($options);
	$GLOBALS[CHUNKER_CACHE_GLOBAL_NAME] = $cache;
	return $cache;
}

function clearGoogleMapDBChunkerCache( $status ) {
	if ( !$enable_chunker_cache )
		return null;

	$cache = getLivemapCache();
	$cache->remove( $status );
}


?>