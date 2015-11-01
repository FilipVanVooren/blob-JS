/*  blob-JS v1.2
(c) 2013 by Filip Van Vooren    
    http://www.oratronik.de 
    
    No warranties. Use at your own risk!
*/
var blobJS = { 
    is_FileAPI_supported : false,
    is_blobJS_ready      : false,
    is_MD5_enabled       : true,
    is_sqlplus_enabled   : true,
    reader               : new FileReader(),
    plsql_dump           : new Array(),
    _files               : undefined,   
    _bytes_per_row       : 64,
    _version             : 'blob-JS (v1.2)',
    
    
    // Check if the File API is available in the browser.
    checkFileAPI : function() {
      if (window.File && window.FileReader && window.FileList && window.Blob) {
         return true;
      } else {
         console.log('The File APIs are not fully supported in this browser.');
         return false;
      } 
    },
                
    clear : function () {      
       this.plsql_dump = [];       
       console.log("Cleared all PL/SQL dumps");
       return true;
    },
    
    disableMD5 : function () {
       this.is_MD5_enabled = false;
       console.log("Disabled MD5 checksum option for PL/SQL array");                   
       return true;
    },
    
    disableSQLPlus : function () {
       this.is_sqlplus_enabled = false;
       console.log("Disabled SQL-Plus header");                
       return true;
    },  
    
    enableMD5 : function () {
       this.is_MD5_enabled = true;
       console.log("Enabled MD5 checksum option for PL/SQL array");                    
       return true;
    },  

    enableSQLPlus : function () {
       this.is_sqlplus_enabled = true;
       console.log("Enabled SQL-Plus header");                 
       return true;
    },  
            
    // Initialize blobJS object
    init : function (p1) {
      this.is_FileAPI_supported = blobJS.checkFileAPI();
      this.is_MD5_enabled       = true;   
      this._bytes_per_row       = 64;

      // p1 can either be an input element of type file or a filelist object.
      if (p1.type && p1.type == 'file') {
         this._files = p1.files;
      } else {
         this._files = p1;    
      }

      console.log(this._version);
      
      if ( this.is_FileAPI_supported && this._files) {
                console.log('blobJS object initialized');
                return (this.is_blobJS_ready = true);
          }

      console.log('blobJS object initialization failed');         
      return false;
    }, // init()

    
    setBytesPerRow : function (p1) {
       if ((typeof(p1) == 'number') && (p1 >= 64) && (p1 <= 2048)) {
          this._bytes_per_row = p1;
          console.log("Bytes per row for PL/SQL array set to: " + p1);        
          return true;
       } else {
          console.log("Failed setting bytes per row for PL/SQL array");            
          return false;
          
       }
    }, // setBytesPerRow()
    
    

    // Dump specified file as PL/SQL program 
    dump : function (p1,p_user_callback_func) {     

        // Private callback function that does most of the work
        function _callBack_Dump(p1,p2,p3,p4,e,p_user_callback_func) {           

            // This is a view on the ArrayBuffer as an unsigned byte (8-bit) array
            // For details see => http://www.khronos.org/registry/typedarray/specs/latest/#5
            var l_ArrayBuffer = e.target.result;           
            var l_byte_view   = new Uint8Array(l_ArrayBuffer);             
            
            var l_bytecnt     = 0;
            var l_buffer      = '';
            var l_row         = '';
            var l_rowcnt      = 1;
            var l_time_start  = new Date;
            var l_time_end;

            // Private function for adding PL/SQL wrapper code
            function _addWrapper(p1) {
                var cr  = "\n";  
                var cr2 = "\n\n";
                
                var l_sql = '';

                if (blobJS.is_sqlplus_enabled) { 
                    l_sql += cr + 'set define off'   
                          +  cr + 'set verify off'
                          +  cr + 'set feedback off'
                          +  cr + 'set serveroutput on'
                          +  cr + 'WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK;';
                }
                
                var l_header =      '  -- Name: ' + p2 
                             + cr + '  -- Size: ' + p3 + ' bytes'
                             + cr + '  -- Type: ' + p4;
                
                l_sql += cr  + 'DECLARE' 
                      +  cr  + '  TYPE blob_array_t is TABLE of VARCHAR2(' + (blobJS._bytes_per_row*2) + ' char) INDEX BY PLS_INTEGER;'
                      +  cr  + '  tab_hex   blob_array_t;'
                      +  cr  + '  tab_md5   VARCHAR2(32 char);'
                      +  cr  + '  my_blob   blob;'
                      +  cr  + '  my_packed raw(32767);'
                      +  cr  + '  my_md5    VARCHAR2(32 char);'
                      +  cr  + 'BEGIN'
                      +  cr  + l_header
                      +  cr  + p1
                      +  cr  + '  dbms_lob.createtemporary(lob_loc => my_blob,'
                      +  cr  + '                           cache   => true,'
                      +  cr  + '                           dur     => dbms_lob.session);'
                      +  cr2 + '  dbms_lob.open(lob_loc   => my_blob,'
                      +  cr  + '                open_mode => dbms_lob.lob_readwrite);'
                      +  cr2 + '  FOR l in 1..tab_hex.count LOOP'
                      +  cr  + '     my_packed := hextoraw(tab_hex(l));'
                      +  cr2 + '     dbms_lob.writeappend(lob_loc => my_blob,'
                      +  cr  + '                          amount  => utl_raw.length(my_packed),'
                      +  cr  + '                          buffer  => my_packed);'
                      +  cr  + '  END LOOP;'
                      +  cr2 + '  dbms_lob.close(lob_loc => my_blob);';
                          
                if (blobJS.is_MD5_enabled) {
                   l_sql += cr2 + '  my_md5 := lower(dbms_crypto.hash(src => my_blob,'
                         +  cr  + '                                   typ => dbms_crypto.hash_md5));'
                         +  cr  + '  IF (my_md5 != tab_md5) THEN'
                         +  cr  + "     RAISE_APPLICATION_ERROR(-20000, 'MD5 checksum does not match. The hexdump is corrupt.');"
                         +  cr  + '  END IF;'
                }
                
                l_sql += cr2 + '  --> Your code to save the blob must be inserted here <--'
                       + cr  + '  --> Your code to save the blob must be inserted here <--';
                
                l_sql += cr2 + '  dbms_lob.freetemporary(lob_loc => my_blob);'
                      +  cr  + 'END;'
                      +  cr  + '/'
                      +  cr;
                return l_sql;           
            } // _addWrapper()
           
           
            // Private function for adding a new row to the PL/SQL varray
            function _addRow() {
               l_buffer += '  tab_hex(' + l_rowcnt + ') := \'';
               l_buffer += l_row;
               l_buffer += "';\n";
               
               l_rowcnt++;
               l_row = '';
            }
           
            // Loop over binary file
            console.log('Processing binary file ...');
            for (l=0; l<l_byte_view.length; l++) {                 
                var l_byte = l_byte_view[l].toString(16).toUpperCase();
                if (l_byte.length == 1) l_byte = "0" + l_byte;         
                l_row += l_byte; 
                l_bytecnt++;

                if (l_bytecnt >= blobJS._bytes_per_row) {
                   _addRow();               
                   l_bytecnt = 0;             
                }
            }
            if (l_bytecnt > 0) _addRow();          

            
            // Calculate MD5 checksum on Typed Array using CryptoJS
            if (blobJS.is_MD5_enabled) {
                console.log('Calculating MD5 checksum ... ');
                var l_md5_chksum = CryptoJS.MD5(CryptoJS.lib.WordArray.create(l_byte_view));   
                l_buffer += "  tab_md5 := '" + l_md5_chksum + "';\n";   
            }

           
            // Add PL/SQL wrapper code around table
            console.log('Adding PL/SQL wrapper and saving to array ...');
            l_buffer = _addWrapper(l_buffer);
                        
            blobJS.plsql_dump.push({ name   : p2,
                                     size   : p3,
                                     type   : p4,
                                     source : l_buffer});

            
            if (typeof p_user_callback_func == 'function') {
               console.log('Executing custom callback function ...');
               
               // Execute custom callback function. The callback should accept 2 parameters
               // p1 = true|false, p2=slot# if success
               p_user_callback_func(true,blobJS.plsql_dump.length - 1);   
            }
            
            var l_time_end = new Date();
            var l_duration = l_time_end - l_time_start;
            console.log('Duration = ' + l_duration + ' ms');
            console.log('Done.');                       
        } // _callBack_Dump()
  
  
      // Read binary file and process
      if ((this.is_blobJS_ready) && (this._files) && (p1 < this._files.length)) {
         var l_file = this._files[p1];
         if (l_file.webkitSlice) {
            var l_blob = l_file.webkitSlice(0);
         } else if (l_file.mozSlice) {
            var l_blob = l_file.mozSlice(0);
         } else if (l_file.slice) {
            var l_blob = l_file.slice(0);
         } else {
            console.log("Unsupported browser, can't read binary file");
            return false;
         }
                      
         console.log('Reading file "' + this._files[p1].name + '" ...');
                         
         this.reader.onloadend = function(e) { _callBack_Dump(p1,
                                                              blobJS._files[p1].name,
                                                              blobJS._files[p1].size,
                                                              blobJS._files[p1].type || 'unkwnown',
                                                              e,
                                                              p_user_callback_func); }
         this.reader.readAsArrayBuffer(l_blob);
         return true;        
      } else {
         console.log('File could not be dumped. Not properly initialized, no appropriate element found or empty');
         return false;
      } 
    }, // dump()    

    
    getDump : function(p1) {
       if (p1 < blobJS.plsql_dump.length) {
          return blobJS.plsql_dump[p1].source;
       }
       console.log('Invalid dump-file number specified');      
       return false;
    }, // getDump()
    
    listDumps : function () {
       var cr       = "\n";          
       var l_buffer = '';      
       for (l=0; l < blobJS.plsql_dump.length; l++) 
           l_buffer += cr + '[' + l + ']'
                    +  cr + '  Name: ' + blobJS.plsql_dump[l].name
                    +  cr + '  Size: ' + blobJS.plsql_dump[l].size + ' bytes'
                    +  cr + '  Type: ' + blobJS.plsql_dump[l].type + cr;
       return l_buffer;
    } // listDumps()
        
} // blobJS{}

 