const cort = require( "../mocha" ),
      assert = require( "assert" ); 

it = cort( it );

describe( "Failing tests", function() {

    it( "assertionFail", function( later, done ) { 
        var total = 3;

        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => assert( false ) );

        function action( name ) {
            console.log( " -", name );
            if( --total == 0 )
                done();
        }
    } );

    this.retries( 2 );

    it( "doneTooEarly", function( later, done ) { 
        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => action( "C" ) );

        function action( name ) {
            console.log( " -", name );
            if( name == "C" )
                done();
        }
    } );
} );
