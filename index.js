// Cort tested exhaustively!
//
// Copyright (c) 2017 12 Quarters Consulting & ...Max...
// MIT License - https://raw.githubusercontent.com/MaxMotovilov/cort/master/LICENSE

exports = module.exports = function cort( test_case, complete, options ) {
	var root, path = [], run_no = 0;

	runTestCase();

	function runTestCase() {
		var curr, pos = 0, pending;

		const pool = [],
			  meta = {
				get name() {
					var result = [], n = run_no - 1;

					do {
						result.push( String.fromCharCode( n % 26 + "a".charCodeAt(0) ) );
						n = Math.floor( n / 26 );
					} while( n > 0 );

					return result.reverse().join( "" )
				},

				get trace() { return path }
			  }

		++run_no;

		if( options && options.maxRuns && run_no > options.maxRuns ) {
			complete( Error( "maxRuns exceeded" ), meta );
			return
		}
			 
		test_case( later, done, meta );

		function later( tag, fn ) {

			const seq = this && this.later && this || { later: later, tags: [] };

			if( fn == null ) {
				fn = tag;
				tag = fn.toString();
			}

			pool.push( { seq: seq, pos: seq.tags.length, fn: fn } );
			seq.tags.push( tag );

			if( !pending ) {
				pending = true;
				(options && options.enqueue || setImmediate)( nextStep );
			}

			return seq
		}

		function done() {
			if( pending || pos < path.length ) {
				complete( Error( "done() called before test case completion" ), meta );
				return 
			}

			nextTestCase();
		}

		function nextStep() {
			var next;

			if( path.length == pos ) {
				// Growing the tree

				pool.sort( (a,b) => tagList( a ).localeCompare( tagList( b ) ) );	

				let node = { next: {}, pool: pool.slice( 0 ) }

				if( pos == 0 )
					root = curr = node;
				else
					curr = curr.next[ path[pos-1] ] = node;

				next = pool.shift();
				path.push( tagList( next ) );		
			} else {
				// Navigating the path
			
				curr = pos == 0 ? root : curr.next[ path[pos-1] ];
				if( !curr )	
					nodeNotFound();

				let next_index = pool.findIndex( item => tagList( item ) == path[pos] );

				if( next_index < 0 ) {
					complete( 
						Error( "Non-deterministic test case: expected choice not available\n" + path[pos] ),
						meta
					);
					return;
				}
			
				[next] = pool.splice( next_index, 1 );
			}

			if( pool.length )
				(options && options.enqueue || setImmediate)( nextStep );
			else
				pending = false;

			++ pos;
			next.fn();
		}
	}

	function nextTestCase() {
		var tried, curr, pos;

		while( path.length > 0 ) {
			tried = path.pop();
			curr = root;

			try {
				path.forEach( tag => (curr = curr.next[tag]) );
				pos = curr.pool.findIndex( item => tagList( item ) == tried );
			} catch( e ) {
				nodeNotFound()
			}

			if( pos < 0 )
				nodeNotFound();
			else while( ++pos < curr.pool.length ) {
				if( curr.pool[pos].pos == 0 || path.indexOf( tagList( curr.pool[pos], -1 ) ) >= 0 ) {
					path.push( tagList( curr.pool[ pos ] ) );
					runTestCase();
					return
				}
			}
		}

		complete();
	}
}

function nodeNotFound() {
	// Bug in cort
	throw Error( "Assertion failed: node not found at path" )
}

function tagList( item, rel ) {
	return item.seq.tags.slice( 0, item.pos + 1 + ( rel || 0 ) ).join( "\n" )
}
