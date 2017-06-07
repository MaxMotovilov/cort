const cort = require( "../mocha" ),
      assert = require( "assert" ); 

it = cort( it );

beforeEach( () => console.log( "Before test" ) );
afterEach( () => console.log( "After test" ) );

describe( "cort/mocha tests", () => {

    var constant;

    beforeEach( () => constant = 1 );
    afterEach( () => console.log( "Constant =", constant ) );

    it( "Minimal", function( later, done ) {
        var total = 3;

        assert.equal( constant++, 1 );

        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => action( "C" ) );

        function action( name ) {
            console.log( " -", name );
            if( --total == 0 )
                done();
        }
    } )
} )
