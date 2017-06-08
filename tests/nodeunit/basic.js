const 	cort = require( "../../index" ),
        assert = require( "assert" );

function testCort( post, body ) {
    return {
        run: function( test ) {
            const variants = [];

            cort.run( 
                ( later, done, meta ) => {
                    console.log( "+", meta.name );
                    variants.push( meta.name );
                    body( later, done );
                },

                ( err, meta ) => {
                    if( err )
                        console.log(
                            err.message + "\n" +
                            meta.trace.map( tag => "  after " + tag + "\n" ).join( "" ) +
                            meta.todo.map(  tag => " before " + tag + "\n" ).join( "" )
                        );

                    post && post( err, variants );
                    test.done();
                }
            )
        },

        iterate: function( test ) {
            
            const variants = [],
                  iterator = cort.iterate( 
                    (later, done) => {
                        console.log( "+", iterator.name );
                        variants.push( iterator.name );
                        body( later, done );
                    }
                  );

            next();

            function next() {
                var { value, done } = iterator.next();
                if( done )
                    test.done();
                else
                    return value.then(
                        next,
                        err => {
                            console.log(
                                err.message + "\n" +
                                iterator.trace.map( tag => "  after " + tag + "\n" ).join( "" ) +
                                iterator.todo.map(  tag => " before " + tag + "\n" ).join( "" )
                            );
                            return next()
                        }
                    )
            }
        }
    }
}

function fails( name_or_num ) {
    return function( err, variants ) {
        assert( err instanceof Error );
        if( name_or_num != null )
            assert.equal( name_or_num, typeof name_or_num == 'string' ? variants[ variants.length-1 ] : variants.length - 1 );
    }
}

function completes( num ) {
    return function( err, variants ) {
        assert.equal( err, null );
        assert.equal( variants.length, num );
    }
}

exports.minimal = testCort(
    completes( 3 ),
    function( later, done ) {
        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => action( "C" ) );

        done();

        function action( name ) {
            console.log( " -", name );
        }
    }
);

exports.completion = testCort( 
    completes( 6 ),
    function( later, done ) {
        var total = 2;
        later( ready => setTimeout( ready( () => --total || done() ), 50 ) );
        later( ready => setTimeout( ready( () => --total || done() ), 100 ) );
    }
);

exports.completion2 = testCort( 
    completes( 20 ),
    function( later, done ) {

        var total = 2;

        later( ready => setTimeout( ready( next( "Path A" ) ), 50 ) );
        later( ready => setTimeout( ready( next( "Path B" ) ), 100 ) );

        function next( tag ) {
            return () => later( tag, () => --total || done() )
        }
    }
);

exports.promises = testCort(
    completes( 6 ),
    function( later, done ) {
        later( ready => ready.when( delay( "foo", 50 ) ).then( v => assert.equal( v, "foo" ) ) );
        later( ready => ready.when( timeout( 100 ) ).then( () => assert( false ), err => assert( err instanceof Error ) ) );
        done();

        function delay( what, ms ) {
            return new Promise( resolve => setTimeout( () => resolve( what ), ms ) )
        }

        function timeout( ms ) {
            return new Promise( (_,reject) => setTimeout( () => reject( Error( "timeout" ) ), ms ) )
        }
    }
);
