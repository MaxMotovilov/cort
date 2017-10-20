const cort = require( "../../mocha" ),
      assert = require( "assert" );

describe( "Shared list update example", () => {

    const store_data = {};

    var runs = 0;

    function promise( action ) {
        return new Promise( resolve => setImmediate( () => resolve( action() ) ) )
    }

    beforeEach( () => store_data.shared = JSON.stringify( [] ) );

    cort( it )( "should add records correctly", function( later, done, meta ) {

        ++runs;

        class Store {

            constructor( client_id ) {
                this.client_id = client_id;
                this.tag_id = 0;
            }
/*
            This fancy approach is unnecessary for atomic operations. Using it, however,
            blows the number of permutations beyond anything node.js can take!
            ============================================================================

            read( key ) {
                return later( 
                    "Read " + this.client_id + "-" + ++this.tag_id, 
                    ready => ready.when( promise( () => this.readSync( key ) ) ) 
                ).promise()
            }

            swap( key, value ) {
                return later( 
                    "Swap " + this.client_id + "-" + ++this.tag_id, 
                    ready => ready.when( promise( () => {
                        const old_value = this.readSync( key );
                        this.writeSync( key, value );
                        return old_value
                    } ) )
                ).promise()
            }
*/
            read( key ) {
                return later( 
                    () => this.readSync( key ),
                    "Read " + this.client_id + "-" + ++this.tag_id
                ).promise()
            }

            swap( key, value ) {
                return later( 
                    () => {
                        const old_value = this.readSync( key );
                        this.writeSync( key, value );
                        return old_value
                    },
                    "Swap " + this.client_id + "-" + ++this.tag_id
                ).promise()
            }

            writeSync( key, value ) {
                store_data[key] = JSON.stringify( value )
            }

            readSync( key ) {
                return JSON.parse( store_data[key] )
            }
        }

        Promise.all([
            run_client( 1 ),
            run_client( 2 ),
            run_client( 3 )
        ]).then(
            () => {
                assert.equal( 
                    JSON.parse( store_data.shared )
                        .reduce( 
                            (check, record) => check.replace( record.data.source, "" ),
                            "123"
                        ),
                    ""
                )
            }
        ).then( done, done );

        function run_client( id ) {
            const store = new Store( id ),
                  shared_list = new SharedList( store, "shared", id );

            return shared_list
                    .add( { source: id } )
                    .then( function( list ) {
                        assert( list.some( record => record.source == id ) )
                    } )
        }
    } );

    it( "should execute 294 variations", () => assert.equal( runs, 294 ) );
} );

class SharedList {
    constructor( store, key, client_id ) {
        this.store = store;
        this.key = key;
        this.client_id = client_id;
        this.record_id = 0;
    }

    add( record ) {
        const self = this, known_records = {};

        record = {
            id: this.client_id + "-" + ++this.record_id,
            data: record
        }

        known_records[ record.id ] = record;

        return this.store.read( this.key )
                   .then( tryUpdating )
                   .then( list => list.map( record => record.data ) );

        function tryUpdating( list ) {

            var record;

            list.forEach( record => {
                if( !known_records[record.id] )
                    known_records[record.id] = record
            } );

            list = Object.keys( known_records ).map( id => known_records[id] );

            return self.store.swap( self.key, list )
                       .then( old_list =>  old_list.every( record => record.id in known_records ) ? list : tryUpdating( old_list ) )
        }		
    }
}

