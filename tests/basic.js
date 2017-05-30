const 	cort = require( "../index" ),
		assert = require( "assert" );

exports.minimal = function( test ) {
	cort( testCase, test.done );

	function testCase( later, done, meta ) {
		console.log( "+", meta.name );

		var total = 3;

		later( () => action( "A" ) );

		later( () => action( "B" ) )
			.later( () => action( "C" ) );

		function action( name ) {
			console.log( " -", name );
			if( --total == 0 )
				done();
		}
	}
}

exports.naive = function( test ) {
	cort( testCase, 
		  (err, meta) => { 
			assert( err instanceof Error ); 
			console.log( err.stack );
			console.log( meta.trace.join( "\n----\n" ) );
			test.done();
		  }
	)

	function testCase( later, done, meta ) {
		console.log( "+", meta.name );

		later( () => action( "A" ) );

		later( () => action( "B" ) )
			.later( "Action C", () => (action( "C" ), done()) );

		function action( name ) {
			console.log( " -", name );
		}
	}
}
